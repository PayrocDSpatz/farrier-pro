import Stripe from 'stripe';
import crypto from 'crypto';
import { callerFromRequest, getDoc, patchDoc, listDocs, getStripeSecretKey, setStripeSecretKey, getGoogleRefreshToken, serverAuth } from './_lib/firebase-rest.js';

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
//                           manager_password_status, set_manager_password
//   customer (portal)     → customer_charge  (amount computed here from their own unpaid invoices)
//   admin                 → migrate_all      (one-time: move legacy Stripe keys + Google tokens off public profiles)
//                           reset_manager_password (clears a farrier's forgotten manager password)
//   anyone                → confirm_session  (only marks paid after Stripe confirms the session)
//   Stripe                → webhook          (signature required)

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

async function cardDetails(stripe, paymentIntentId) {
  try {
    const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
    const card = charges.data[0]?.payment_method_details?.card;
    const brand = card?.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card';
    return { last4: card?.last4 || '', brand };
  } catch (e) { return { last4: '', brand: 'Card' }; }
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
      let linkedInvoiceId = session.metadata?.invoiceId || '';
      if (!linkedInvoiceId && session.payment_link) {
        const link = await stripe.paymentLinks.retrieve(session.payment_link);
        linkedInvoiceId = link.metadata?.invoiceId || '';
      }
      if (session.payment_status !== 'paid' || linkedInvoiceId !== invoiceId) {
        return res.status(400).json({ success: false, error: 'Payment not confirmed by Stripe.' });
      }
      const card = session.payment_intent ? await cardDetails(stripe, session.payment_intent) : {};
      await markInvoicePaid(invoiceId, { paymentIntentId: session.payment_intent || '', sessionId, paidVia: 'stripe_link', ...card });
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
      const amountCents = Math.round(invoices.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100);
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
        await markInvoicePaid(inv.id, { paymentIntentId: pi.id, paidVia: invoices.length > 1 ? 'stripe_card_multi' : 'stripe_card', ...card });
        if (inv.paymentLinkId) await stripe.paymentLinks.update(inv.paymentLinkId, { active: false }).catch(() => {});
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
      if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) return res.status(400).json({ success: false, error: 'Secret key must start with sk_' });
      const account = await new Stripe(stripeSecretKey).accounts.retrieve();
      await setStripeSecretKey(farrierId, stripeSecretKey);
      return res.status(200).json({ success: true, accountName: account.settings?.dashboard?.display_name || account.email || 'Stripe Account' });
    }
    if (action === 'disconnect') {
      await setStripeSecretKey(farrierId, '');
      return res.status(200).json({ success: true });
    }
    if (action === 'status') {
      const key = await getStripeSecretKey(farrierId); // also migrates a legacy key off the profile
      return res.status(200).json({ success: true, connected: !!key, mode: key.startsWith('sk_live_') ? 'live' : key ? 'test' : '' });
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

    if (action === 'charge') {
      const { paymentMethodId, amount, currency = 'usd', invoiceId, invoiceNumber, customerEmail, customerName } = body;
      if (!paymentMethodId || !amount) return res.status(400).json({ success: false, error: 'Missing paymentMethodId or amount.' });
      const amountCents = Math.round(parseFloat(amount) * 100);
      if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
      let customerId;
      if (customerEmail) {
        const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
        customerId = existing.data.length > 0 ? existing.data[0].id : (await stripe.customers.create({ email: customerEmail, name: customerName, metadata: { farrierId, source: 'FarriTech' } })).id;
      }
      if (customerId) await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      const pi = await stripe.paymentIntents.create({
        amount: amountCents, currency, payment_method: paymentMethodId,
        customer: customerId || undefined, confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `FarriTech Invoice #${invoiceNumber}`,
        metadata: { farrierId, invoiceId: invoiceId || '', invoiceNumber: invoiceNumber || '' },
        receipt_email: customerEmail || undefined,
      });
      if (pi.status === 'succeeded') {
        const card = await cardDetails(stripe, pi.id);
        return res.status(200).json({ success: true, transactionId: pi.id, ...card });
      }
      return res.status(400).json({ success: false, error: `Payment status: ${pi.status}` });
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

    if (action === 'payment_link') {
      const { amount, invoiceId, invoiceNumber, customerEmail } = body;
      if (!amount || !invoiceId) return res.status(400).json({ success: false, error: 'Missing amount or invoiceId.' });
      const amountCents = Math.round(parseFloat(amount) * 100);
      if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
      const price = await stripe.prices.create({
        unit_amount: amountCents, currency: 'usd',
        product_data: { name: `Invoice #${invoiceNumber || invoiceId}`, metadata: { farrierId, invoiceId } },
      });
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: { type: 'redirect', redirect: { url: `https://app.farritech.com/customer-portal.html?invoice_id=${invoiceId}&session_id={CHECKOUT_SESSION_ID}` } },
        metadata: { farrierId, invoiceId, invoiceNumber: invoiceNumber || '' },
        invoice_creation: { enabled: false },
        restrictions: { completed_sessions: { limit: 1 } },
        ...(customerEmail ? { customer_creation: 'always' } : {}),
      });
      return res.status(200).json({ success: true, paymentUrl: paymentLink.url, paymentLinkId: paymentLink.id });
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
    return res.status(400).json({ success: false, error: err?.raw?.message || err?.message || 'Payment processing failed' });
  }
}
