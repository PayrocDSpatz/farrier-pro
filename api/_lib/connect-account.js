// Stripe Connect support for invoice payments.
//
// Two kinds of farriers can take card payments:
//   • Own key (unchanged): the farrier pasted their own Stripe secret key in Settings.
//   • FarriTech Payments (Connect): the farrier set up a connected account through the
//     setup link that www.farritech.com emails after signup (farrier-pro-landing-page repo,
//     api/connect.js). We charge on their account with FarriTech's platform key plus the
//     Stripe-Account header (direct charges), and take FarriTech's per-farrier fee.
// A farrier with their own key always keeps using it, even if they also have a Connect account.
//
// Where things live:
//   farrierSecrets/{uid}.stripeConnectAccountId / stripeConnectCustomerId — set by syncConnect
//   farriers/{uid}.stripePublishableKey (platform pk) + stripeConnectAccountId — written by the
//     farrier's own browser after syncConnect says they're approved, the same way the
//     own-key flow saves its publishable key. The browser card forms pass the account ID to
//     Stripe.js as { stripeAccount }.
//   Fee rate: metadata.connectFeePercent on the farrier's Customer in the platform Stripe
//     account (default 0.50%) — edit it in the Stripe Dashboard to change one farrier's rate.
import Stripe from 'stripe';
// Newest SDK, aliased so the existing payment code stays on stripe@17 (only used for the v2 Accounts API).
import StripeV2 from 'stripe-connect';
import { getDoc, patchDoc, getStripeSecretKey } from './firebase-rest.js';

export const DEFAULT_FEE_PERCENT = 0.5;

// PLACEHOLDER: STRIPE_PLATFORM_SECRET_KEY — the FarriTech platform secret key (the same
// account as STRIPE_SECRET_KEY on www.farritech.com). Set it in Vercel for this project.
function platformKey() {
  return process.env.STRIPE_PLATFORM_SECRET_KEY || '';
}

// Stripe client for a farrier's payments, or null if they can't take cards yet.
//   { stripe, connect: null }                        → own key (exactly as before)
//   { stripe, connect: { accountId, customerId } }   → FarriTech Payments
export async function farrierStripe(farrierId) {
  const key = await getStripeSecretKey(farrierId);
  if (key) return { stripe: new Stripe(key), connect: null };
  const secrets = await getDoc(`farrierSecrets/${farrierId}`).catch(() => null);
  const accountId = secrets?.stripeConnectAccountId;
  if (!accountId || secrets?.stripeConnectOptOut) return null;
  if (!platformKey()) {
    console.error('Connect farrier', farrierId, 'has an account but STRIPE_PLATFORM_SECRET_KEY is not set.');
    return null;
  }
  // stripeAccount on the client = Stripe-Account header on every request it makes.
  return {
    stripe: new Stripe(platformKey(), { stripeAccount: accountId }),
    connect: { accountId, customerId: secrets.stripeConnectCustomerId || '' },
  };
}

// FarriTech's cut of a Connect payment, in cents (0 for own-key farriers).
export async function connectFeeCents(connect, amountCents) {
  if (!connect) return 0;
  let pct = DEFAULT_FEE_PERCENT;
  if (connect.customerId) {
    const customer = await new Stripe(platformKey()).customers.retrieve(connect.customerId).catch(() => null);
    const raw = customer?.metadata?.connectFeePercent;
    const n = Number(raw);
    if (raw !== undefined && String(raw).trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 20) pct = n;
  }
  return Math.max(0, Math.round((amountCents * pct) / 100));
}

// Spread into PaymentIntent params: adds FarriTech's fee for Connect payments only.
export async function feeParams(connect, amountCents) {
  const fee = await connectFeeCents(connect, amountCents);
  return fee > 0 ? { application_fee_amount: fee } : {};
}

// Called when the app opens for a farrier without Stripe: looks for a Connect account set up
// through www.farritech.com (by the farrier's signup email) and, once Stripe has approved it,
// remembers it. Returns what the browser should save on the farrier's profile.
export async function syncConnect(farrierId, email) {
  if (await getStripeSecretKey(farrierId)) return { linked: false, reason: 'own_key' };
  const secrets = await getDoc(`farrierSecrets/${farrierId}`).catch(() => null);
  if (secrets?.stripeConnectOptOut) return { linked: false, reason: 'opted_out' };
  if (!platformKey()) return { linked: false, reason: 'not_configured' };
  // PLACEHOLDER: STRIPE_PLATFORM_PUBLISHABLE_KEY — the platform account's pk_… key (browsers
  // use it with { stripeAccount } to collect cards for connected accounts).
  const publishableKey = process.env.STRIPE_PLATFORM_PUBLISHABLE_KEY || '';
  if (!publishableKey) return { linked: false, reason: 'not_configured' };

  let accountId = secrets?.stripeConnectAccountId || '';
  let customerId = secrets?.stripeConnectCustomerId || '';
  if (!accountId) {
    if (!email) return { linked: false, reason: 'no_email' };
    const platform = new Stripe(platformKey());
    const found = await platform.customers.list({ email: String(email).toLowerCase(), limit: 10 });
    const match = found.data.find(c => c.metadata?.connectAccountId);
    if (!match) return { linked: false, reason: 'no_account' };
    accountId = match.metadata.connectAccountId;
    customerId = match.id;
  }

  // Approval status is always read live from Stripe.
  const account = await new StripeV2(platformKey()).v2.core.accounts.retrieve(accountId, { include: ['configuration.merchant'] });
  const ready = account?.configuration?.merchant?.capabilities?.card_payments?.status === 'active';
  if (!ready) return { linked: false, pending: true, reason: 'not_approved' };

  if (secrets?.stripeConnectAccountId !== accountId) {
    await patchDoc(`farrierSecrets/${farrierId}`, {
      stripeConnectAccountId: accountId, stripeConnectCustomerId: customerId, stripeConnectLinkedAt: new Date(),
    });
  }
  return { linked: true, publishableKey, accountId, accountName: account.display_name || 'FarriTech Payments' };
}

// "Disconnect" in Settings for a Connect farrier: stop using the account in FarriTech and don't
// re-link it automatically. (The Stripe account itself stays; it belongs to the farrier.)
export async function optOutConnect(farrierId) {
  await patchDoc(`farrierSecrets/${farrierId}`, { stripeConnectOptOut: true }, ['stripeConnectAccountId']);
}

// ── Connect webhook: /api/stripe/connect-events ──
// (vercel.json rewrites it to /api/stripe-payment?connectEvents=1 — it runs inside
// stripe-payment because the Hobby plan allows only 12 functions per deploy.)
//
// Pay-link checkouts for Connect farriers happen on their connected accounts, so Stripe sends
// checkout.session.completed to the platform's Connect webhook instead of a per-farrier one.
// SETUP: Stripe Dashboard (platform) → Developers → Webhooks → + Add destination →
//   Events from: "Connected accounts", payload style "Snapshot", event checkout.session.completed,
//   URL https://app.farritech.com/api/stripe/connect-events → copy its whsec_… into Vercel as
//   STRIPE_CONNECT_EVENTS_SECRET.
export async function connectEventsWebhook(req, res, rawBody, { recordCheckoutSession, sendPaidSms }) {
  // PLACEHOLDER: STRIPE_CONNECT_EVENTS_SECRET (see SETUP above).
  const secret = process.env.STRIPE_CONNECT_EVENTS_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook not configured: set STRIPE_CONNECT_EVENTS_SECRET in Vercel.' });
  let event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('Rejected Connect webhook with bad signature:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (event.type !== 'checkout.session.completed' || !event.account) return res.status(200).json({ received: true });

  try {
    const session = event.data.object;
    const farrierId = session.metadata?.farrierId || '';
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(farrierId)) return res.status(200).json({ received: true, ignored: 'no farrier' });
    // Only trust the event for the farrier whose connected account actually sent it.
    const secrets = await getDoc(`farrierSecrets/${farrierId}`).catch(() => null);
    if (secrets?.stripeConnectAccountId !== event.account) {
      console.warn(`Connect event from ${event.account} doesn't match farrier ${farrierId}; ignored.`);
      return res.status(200).json({ received: true, ignored: 'account mismatch' });
    }
    const stripe = new Stripe(platformKey(), { stripeAccount: event.account });
    const result = await recordCheckoutSession(stripe, farrierId, session);
    console.log(`📥 Connect checkout.session.completed ${session.id} for ${farrierId}:`, JSON.stringify({ invoiceId: result.invoiceId, status: result.status, ignored: result.ignored, duplicate: result.duplicate }));
    if (result.status && !result.duplicate && !result.alreadyPaid) {
      await sendPaidSms(session.customer_details?.phone, session.customer_details?.name, session.amount_total || 0, result.invoice?.invoiceNumber || '');
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    // 500 makes Stripe retry later; recording is idempotent per session.
    console.error('❌ Connect webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
