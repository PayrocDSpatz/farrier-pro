import Stripe from 'stripe';
import crypto from 'crypto';
import '../lib/pricing.js';
import { callerFromRequest, getDoc, patchDoc, listDocs, getStripeSecretKey, setStripeSecretKey, getGoogleRefreshToken, serverAuth } from './_lib/firebase-rest.js';
import {
  applyPayment, cardDetails, closeOnlinePayment, createCheckoutSession, recordCheckoutSession,
  removeWebhook, sendUpdatedPayLink, setupWebhook, PaymentError,
} from './_lib/invoice-payments.js';

const P = globalThis.FarriPricing;
const SECRET_KEY_RE = /^(sk|rk)_(live|test)_/;

// May run one-off maintenance actions (same list as the sponsorBanners rule).
const ADMIN_EMAILS = ['david@dasconsulting.com', 'david@dasdigitalai.com'];

// Disable body parser so we can read raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

// Stripe secret keys never travel through browsers. Callers prove who they are with a
// Firebase ID token (Authorization: Bearer <token>) and the server looks up the right
// farrier's key in the locked farrierSecrets collection (see _lib/firebase-rest.js).
//
// Who can call what:
//   farrier (signed in)   → status, connect, disconnect, charge, refund, payment_link, deactivate_link,
//                           record_payment, waive_card_price, manager_password_status, set_manager_password
//   customer (portal)     → customer_charge  (amount computed here from their own unpaid invoices)
//   admin                 → migrate_all      (one-time: move legacy Stripe keys + Google tokens off public profiles)
//                           reset_manager_password (clears a farrier's forgotten manager password)
//   anyone                → confirm_session  (only marks paid after Stripe confirms the session)
//   Stripe                → webhook          (legacy platform webhook, signature required; farriers'
//                                               own accounts post to api/stripe/webhook/[farrierId].js)
//
// Amounts are always worked out here from the invoice (lib/pricing.js), never taken from
// the browser — see api/_lib/invoice-payments.js for how payments are recorded.

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function ownInvoice(invoiceId, farrierId) {
  if (!invoiceId) throw new PaymentError('Missing invoiceId.');
  const invoice = await getDoc(`invoices/${invoiceId}`);
  if (!invoice || invoice.farrierId !== farrierId) throw new PaymentError('Invoice not found.', 404);
  return invoice;
}

async function markInvoicePaid(invoiceId, details) {
  await patchDoc(`invoices/${invoiceId}`, {
    status: 'paid',
    paidAt: new Date(),
    paymentMethod: 'card',
    ...(details.paymentIntentId ? { stripePaymentIntentId: details.paymentIntentId, transactionId: details.paymentIntentId } : {}),
    ...(details.sessionId ? { stripeSessionId: details.sessionId } : {}),
    cardLast4: details.last4 || '',
    cardType: details.brand || '',
    ...(details.paidVia ? { paidVia: details.paidVia } : {}),
  });
}

// Manager password is stored as "scrypt$<salt>$<hash>" in farrierSecrets/{uid}.
function hashManagerPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(String(password), salt, 32).toString('hex')}`;
}
function checkManagerPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const actual = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
}

async function sendPaidSms(to, name, amount, invoiceNumber) {
  if (!to) return;
  try {
    const { idToken } = await serverAuth();
    await fetch('https://app.farritech.com/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ to, body: `Hi ${name || 'there'}, your payment of $${amount} for invoice #${invoiceNumber} has been received. Thank you! Reply STOP to opt out.` }),
    });
  } catch (e) { console.warn('Confirmation SMS error:', e.message); }
}

async function handleWebhook(req, res, rawBody) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(400).json({ error: 'Webhook not configured' });
  let event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('Rejected webhook with bad signature:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }
  console.log('📥 Stripe webhook:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const invoiceId = session.metadata?.invoiceId || '';
      if (invoiceId && session.payment_status === 'paid') {
        await markInvoicePaid(invoiceId, { paymentIntentId: session.payment_intent || '', sessionId: session.id, paidVia: 'stripe_link' });
        console.log('✅ Invoice', invoiceId, 'marked paid via checkout webhook');
        await sendPaidSms(session.customer_details?.phone, session.customer_details?.name,
          ((session.amount_total || 0) / 100).toFixed(2), session.metadata?.invoiceNumber || '');
      }
    }
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const invoiceIds = (pi.metadata?.invoiceId || '').split(',').filter(Boolean);
      for (const id of invoiceIds) {
        await markInvoicePaid(id, { paymentIntentId: pi.id, paidVia: 'stripe_card' });
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await getRawBody(req);
  if (req.headers['stripe-signature']) return handleWebhook(req, res, rawBody);

  try {
    const body = JSON.parse(rawBody.toString() || '{}');
    const { action } = body;

    // ── Public: confirm a payment-link checkout after the customer is redirected back ──
    if (action === 'confirm_session') {
      const { invoiceId, sessionId } = body;
      if (!invoiceId || !sessionId) return res.status(400).json({ success: false, error: 'Missing invoiceId or sessionId.' });
      const invoice = await getDoc(`invoices/${invoiceId}`);
      if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
      if (invoice.status === 'paid') return res.status(200).json({ success: true, alreadyPaid: true });
      const key = await getStripeSecretKey(invoice.farrierId);
      if (!key) return res.status(400).json({ success: false, error: 'Farrier payments not configured.' });
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const result = await recordCheckoutSession(stripe, invoice.farrierId, session);
      if (result.invoiceId !== invoiceId) return res.status(400).json({ success: false, error: 'Payment not confirmed by Stripe.' });
      return res.status(200).json({ success: true });
    }

    const caller = await callerFromRequest(req);
    if (!caller) return res.status(401).json({ success: false, error: 'Please sign in again.' });

    // ── Customer portal: pay one or more of your own unpaid invoices ──
    if (action === 'customer_charge') {
      const { invoiceIds = [], paymentMethodId } = body;
      if (!paymentMethodId || !invoiceIds.length) return res.status(400).json({ success: false, error: 'Missing payment details.' });
      const invoices = [];
      for (const id of invoiceIds) {
        const inv = await getDoc(`invoices/${id}`);
        if (!inv || (inv.customerEmail || '').toLowerCase() !== caller.email) return res.status(403).json({ success: false, error: 'Invoice not found.' });
        if (inv.status === 'paid') return res.status(400).json({ success: false, error: `Invoice ${inv.invoiceNumber || id} is already paid.` });
        invoices.push({ id, ...inv });
      }
      const farrierId = invoices[0].farrierId;
      if (invoices.some(i => i.farrierId !== farrierId)) return res.status(400).json({ success: false, error: 'Please pay each farrier separately.' });
      const key = await getStripeSecretKey(farrierId);
      if (!key) return res.status(400).json({ success: false, error: 'Payment not configured. Please contact your farrier.' });
      const stripe = new Stripe(key);
      for (const inv of invoices) { inv.cashCents = P.balanceCents(inv); inv.chargeCents = P.getChargeCents(inv, 'card_link', inv.cashCents); }
      const amountCents = invoices.reduce((s, i) => s + i.chargeCents, 0);
      if (amountCents <= 0) return res.status(400).json({ success: false, error: 'Nothing to pay.' });
      const numbers = invoices.map(i => i.invoiceNumber).filter(Boolean).join(', ');
      const pi = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', payment_method: paymentMethodId, confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `FarriTech Invoice #${numbers}`,
        metadata: { farrierId, invoiceId: invoiceIds.join(','), invoiceNumber: numbers },
        receipt_email: caller.email || undefined,
      });
      if (pi.status !== 'succeeded') return res.status(400).json({ success: false, error: `Payment status: ${pi.status}` });
      const card = await cardDetails(stripe, pi.id);
      for (const inv of invoices) {
        await applyPayment(inv.id, {
          paymentId: invoices.length > 1 ? `${pi.id}_${inv.id}` : pi.id, method: 'card_link',
          amountCents: inv.chargeCents, creditCents: inv.cashCents, source: 'stripe',
          paymentIntentId: pi.id, last4: card.last4, brand: card.brand,
          paidVia: invoices.length > 1 ? 'stripe_card_multi' : 'stripe_card', recordedBy: caller.email,
        });
        await closeOnlinePayment(stripe, inv);
      }
      return res.status(200).json({ success: true, transactionId: pi.id, amount: amountCents / 100, ...card });
    }

    // ── Admin, one-time: move every farrier's legacy key off the public profiles ──
    // (Farriers who log in get migrated automatically via 'status'; this catches the rest.)
    if (action === 'migrate_all') {
      if (!ADMIN_EMAILS.includes(caller.email)) return res.status(403).json({ success: false, error: 'Admins only.' });
      const farriers = await listDocs('farriers', ['stripeSecretKey', 'googleRefreshToken', 'googleAccessToken']);
      let migrated = 0, googleMigrated = 0;
      for (const f of farriers) {
        if (f.stripeSecretKey) { await getStripeSecretKey(f.id); migrated++; }
        if (f.googleRefreshToken || f.googleAccessToken) { await getGoogleRefreshToken(f.id); googleMigrated++; }
      }
      return res.status(200).json({
        success: true, farriers: farriers.length, stripeKeysMigrated: migrated, googleTokensMigrated: googleMigrated,
      });
    }

    // ── Admin: clear a farrier's forgotten manager password so they can set a new one ──
    if (action === 'reset_manager_password') {
      if (!ADMIN_EMAILS.includes(caller.email)) return res.status(403).json({ success: false, error: 'Admins only.' });
      if (!body.farrierId) return res.status(400).json({ success: false, error: 'Missing farrierId.' });
      await patchDoc(`farrierSecrets/${body.farrierId}`, {}, ['managerPasswordHash']);
      return res.status(200).json({ success: true });
    }

    // Everything below acts on the signed-in farrier's own Stripe account.
    const farrierId = caller.uid;

    if (action === 'connect' || action === 'validate') {
      const { stripeSecretKey } = body;
      if (!stripeSecretKey || !SECRET_KEY_RE.test(stripeSecretKey)) return res.status(400).json({ success: false, error: 'Secret key must start with sk_live_, sk_test_, rk_live_ or rk_test_' });
      const stripe = new Stripe(stripeSecretKey);
      let accountName = 'Stripe Account';
      try {
        const account = await stripe.accounts.retrieve();
        accountName = account.settings?.dashboard?.display_name || account.email || accountName;
      } catch (e) {
        // Restricted (rk_) keys usually can't read account details; prove the key works
        // with a call the app actually needs (PaymentIntents) instead.
        if (e.type !== 'StripePermissionError') throw e;
        await stripe.paymentIntents.list({ limit: 1 });
      }
      // Each farrier's Stripe account has to tell us when an invoice is paid online.
      await setupWebhook(stripe, farrierId);
      await setStripeSecretKey(farrierId, stripeSecretKey);
      return res.status(200).json({ success: true, accountName });
    }
    if (action === 'disconnect') {
      const oldKey = await getStripeSecretKey(farrierId);
      await removeWebhook(oldKey ? new Stripe(oldKey) : null, farrierId);
      await setStripeSecretKey(farrierId, '');
      return res.status(200).json({ success: true });
    }
    if (action === 'status') {
      const key = await getStripeSecretKey(farrierId); // also migrates a legacy key off the profile
      const secrets = key ? await getDoc(`farrierSecrets/${farrierId}`) : null;
      return res.status(200).json({ success: true, connected: !!key, mode: /^(sk|rk)_live_/.test(key) ? 'live' : key ? 'test' : '', webhookConfigured: !!secrets?.stripeWebhookSecret });
    }

    // ── Record a payment taken outside FarriTech (cash, check, ACH, Zelle, Venmo, card terminal, other) ──
    // Works without Stripe connected; if there is an open online checkout it gets closed so
    // the customer can't pay twice.
    if (action === 'record_payment') {
      const { invoiceId, method, amount, reference = '', datePaid } = body;
      if (!P.MANUAL_METHODS[method]) return res.status(400).json({ success: false, error: 'Pick a payment method.' });
      const invoice = await ownInvoice(invoiceId, farrierId);
      const amountCents = P.toCents(amount);
      if (amountCents <= 0) return res.status(400).json({ success: false, error: 'Enter a valid amount.' });
      const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(datePaid || '')) ? `${datePaid}T17:00:00Z` : datePaid;
      const paidDate = dateStr && !isNaN(new Date(dateStr)) ? new Date(dateStr) : null;
      const result = await applyPayment(invoiceId, {
        method, amountCents,
        reference: String(reference).slice(0, 120), recordedBy: caller.email || caller.uid, paidDate,
      });
      const key = await getStripeSecretKey(farrierId);
      if (key) await closeOnlinePayment(new Stripe(key), invoice);
      return res.status(200).json({ success: true, status: result.status, balance: (result.balanceCents || 0) / 100 });
    }

    // ── Manager password (Settings → Manager Password): guards refunds ──
    if (action === 'manager_password_status') {
      const secrets = await getDoc(`farrierSecrets/${farrierId}`);
      return res.status(200).json({ success: true, isSet: !!secrets?.managerPasswordHash });
    }
    if (action === 'set_manager_password') {
      const { currentPassword, newPassword } = body;
      if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ success: false, error: 'New manager password must be at least 6 characters.' });
      const secrets = await getDoc(`farrierSecrets/${farrierId}`);
      if (secrets?.managerPasswordHash && !checkManagerPassword(currentPassword, secrets.managerPasswordHash)) {
        return res.status(403).json({ success: false, error: 'Current manager password is incorrect.' });
      }
      await patchDoc(`farrierSecrets/${farrierId}`, { managerPasswordHash: hashManagerPassword(newPassword), managerPasswordUpdatedAt: new Date() });
      return res.status(200).json({ success: true });
    }

    const key = await getStripeSecretKey(farrierId);
    if (!key) return res.status(400).json({ success: false, error: 'No Stripe account connected. Connect Stripe in Settings → Stripe Payments.' });
    const stripe = new Stripe(key);

    // Keyed card payment. `applyAmount` is how much of the (cash-price) balance to pay off —
    // omit it to pay the whole balance. The card price is added here, then the payment is
    // recorded on the invoice before we answer, so the browser never has to write it.
    if (action === 'charge') {
      const { paymentMethodId, invoiceId, applyAmount } = body;
      if (!paymentMethodId || !invoiceId) return res.status(400).json({ success: false, error: 'Missing paymentMethodId or invoiceId.' });
      const invoice = await ownInvoice(invoiceId, farrierId);
      if (invoice.status === 'paid' || invoice.status === 'cancelled') return res.status(400).json({ success: false, error: `This invoice is ${invoice.status}.` });
      const balance = P.balanceCents(invoice);
      const cashCents = applyAmount ? Math.min(P.toCents(applyAmount), balance) : balance;
      if (cashCents <= 0) return res.status(400).json({ success: false, error: 'Nothing is owed on this invoice.' });
      const amountCents = P.getChargeCents(invoice, 'card_keyed', cashCents);
      const priceType = amountCents !== cashCents ? 'card' : 'cash';
      const invoiceNumber = invoice.invoiceNumber || '';
      const customerEmail = invoice.customerEmail || '', customerName = invoice.customerName || '';
      let customerId;
      if (customerEmail) {
        const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
        customerId = existing.data.length > 0 ? existing.data[0].id : (await stripe.customers.create({ email: customerEmail, name: customerName, metadata: { farrierId, source: 'FarriTech' } })).id;
      }
      if (customerId) await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      const pi = await stripe.paymentIntents.create({
        amount: amountCents, currency: 'usd', payment_method: paymentMethodId,
        customer: customerId || undefined, confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `FarriTech Invoice #${invoiceNumber}`,
        metadata: { farrierId, invoiceId, invoiceNumber, method: 'card_keyed', priceType, baseCents: String(cashCents), cardCents: String(amountCents) },
        receipt_email: customerEmail || undefined,
      });
      if (pi.status !== 'succeeded') return res.status(400).json({ success: false, error: `Payment status: ${pi.status}` });
      const card = await cardDetails(stripe, pi.id);
      const result = await applyPayment(invoiceId, {
        paymentId: pi.id, method: 'card_keyed', amountCents, creditCents: cashCents, source: 'stripe',
        paymentIntentId: pi.id, last4: card.last4, brand: card.brand, paidVia: 'stripe_card', recordedBy: caller.email || caller.uid,
      });
      await closeOnlinePayment(stripe, invoice);
      return res.status(200).json({ success: true, transactionId: pi.id, amount: amountCents / 100, status: result.status, ...card });
    }

    if (action === 'refund') {
      const { transactionId, amount: refundAmount, refundPassword } = body;
      if (!transactionId) return res.status(400).json({ success: false, error: 'Missing transactionId.' });
      // Refunds need this farrier's manager password (set in Settings; stored hashed server-side).
      const secrets = await getDoc(`farrierSecrets/${farrierId}`);
      if (!secrets?.managerPasswordHash) return res.status(400).json({ success: false, error: 'Set a Manager Password in Settings before issuing refunds.' });
      if (!checkManagerPassword(refundPassword, secrets.managerPasswordHash)) return res.status(403).json({ success: false, error: 'Incorrect manager password.' });
      const refund = await stripe.refunds.create({ payment_intent: transactionId, amount: refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined });
      return res.status(200).json({ success: true, refundId: refund.id, amount: refund.amount / 100 });
    }

    // Online pay link for an invoice: a Checkout Session for the balance (card price unless
    // waived) behind the permanent https://app.farritech.com/pay/{invoiceId} link.
    if (action === 'payment_link') {
      const { invoiceId } = body;
      const invoice = await ownInvoice(invoiceId, farrierId);
      if (invoice.status === 'paid' || invoice.status === 'cancelled') return res.status(400).json({ success: false, error: `This invoice is ${invoice.status}.` });
      const { paymentUrl, chargeCents, cashCents, session } = await createCheckoutSession(stripe, invoiceId, invoice);
      return res.status(200).json({ success: true, paymentUrl, checkoutSessionId: session.id, amount: chargeCents / 100, cashAmount: cashCents / 100 });
    }

    // "Waive card price & resend" (waive: true) and "Undo waiver" (waive: false).
    if (action === 'waive_card_price') {
      const { invoiceId, waive = true } = body;
      const invoice = await ownInvoice(invoiceId, farrierId);
      if (invoice.status === 'paid' || invoice.status === 'cancelled') return res.status(400).json({ success: false, error: `This invoice is ${invoice.status}.` });
      if (invoice.checkoutSessionId) {
        const current = await stripe.checkout.sessions.retrieve(invoice.checkoutSessionId).catch(() => null);
        if (current?.status === 'complete') {
          if (current.payment_status === 'paid') await recordCheckoutSession(stripe, farrierId, current);
          return res.status(409).json({ success: false, error: 'Customer already paid by card.' });
        }
      }
      const changes = waive
        ? { cardFeeWaived: true, cardFeeWaivedBy: caller.email || caller.uid, cardFeeWaivedAt: new Date() }
        : { cardFeeWaived: false, cardFeeWaivedBy: '', cardFeeWaivedAt: null };
      await patchDoc(`invoices/${invoiceId}`, changes);
      const updated = { ...invoice, ...changes };
      // createCheckoutSession expires the open session before making the new one.
      const { paymentUrl, chargeCents } = await createCheckoutSession(stripe, invoiceId, updated);
      const sentVia = await sendUpdatedPayLink(updated, invoiceId, chargeCents);
      return res.status(200).json({ success: true, paymentUrl, amount: chargeCents / 100, sentVia });
    }

    if (action === 'deactivate_link') {
      const { paymentLinkId } = body;
      if (!paymentLinkId) return res.status(400).json({ success: false, error: 'Missing paymentLinkId.' });
      await stripe.paymentLinks.update(paymentLinkId, { active: false });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Invalid action.' });
  } catch (err) {
    console.error('stripe-payment error:', err);
    if (err instanceof PaymentError) return res.status(err.status).json({ success: false, error: err.message });
    return res.status(400).json({ success: false, error: err?.raw?.message || err?.message || 'Payment processing failed' });
  }
}
