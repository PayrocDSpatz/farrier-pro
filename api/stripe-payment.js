import Stripe from 'stripe';

// Disable body parser so we can read raw body for webhook signature verification
export const config = { api: { bodyParser: false } };

const PROJECT_ID = 'farrier-pro';
const FIREBASE_API_KEY = 'AIzaSyAQ1LaWG9lE9j5h6X0T0YQKa_j04vJZHE4';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function markInvoicePaid(invoiceId, paymentDetails) {
  const url = `${BASE_URL}/invoices/${invoiceId}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=status&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=paymentMethod&updateMask.fieldPaths=stripePaymentIntentId&updateMask.fieldPaths=cardLast4&updateMask.fieldPaths=cardType`;
  const now = new Date().toISOString();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status: { stringValue: 'paid' },
        paidAt: { timestampValue: now },
        paymentMethod: { stringValue: paymentDetails.paymentMethod || 'card' },
        stripePaymentIntentId: { stringValue: paymentDetails.paymentIntentId || '' },
        cardLast4: { stringValue: paymentDetails.last4 || '' },
        cardType: { stringValue: paymentDetails.brand || '' },
      }
    })
  });
  if (!res.ok) throw new Error(`Firestore update failed: ${await res.text()}`);
  return await res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,stripe-signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Always read raw body first
  const rawBody = await getRawBody(req);
  const isWebhook = !!req.headers['stripe-signature'];

  // ── WEBHOOK PATH ──
  if (isWebhook) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
      if (webhookSecret && sig) {
        const stripe = new Stripe(process.env.STRIPE_WEBHOOK_VERIFY_KEY || 'sk_test_x');
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } else {
        event = JSON.parse(rawBody.toString());
      }
    } catch(err) {
      console.error('Webhook parse error:', err.message);
      event = JSON.parse(rawBody.toString());
    }

    console.log('📥 Stripe webhook:', event.type);

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const invoiceId = metadata.invoiceId || '';
        const invoiceNumber = metadata.invoiceNumber || '';
        console.log('💳 Checkout completed — invoiceId:', invoiceId, 'status:', session.payment_status);

        if (invoiceId && session.payment_status === 'paid') {
          let last4 = '', brand = '', paymentIntentId = session.payment_intent || '';
          if (paymentIntentId && metadata.farrierId) {
            try {
              const profileRes = await fetch(`${BASE_URL}/farriers/${metadata.farrierId}?key=${FIREBASE_API_KEY}`);
              if (profileRes.ok) {
                const profile = await profileRes.json();
                const stripeKey = profile.fields?.stripeSecretKey?.stringValue || '';
                if (stripeKey && stripeKey.startsWith('sk_')) {
                  const stripe = new Stripe(stripeKey);
                  const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
                  last4 = charges.data[0]?.payment_method_details?.card?.last4 || '';
                  brand = charges.data[0]?.payment_method_details?.card?.brand || '';
                  if (brand) brand = brand.charAt(0).toUpperCase() + brand.slice(1);
                }
              }
            } catch(e) { console.warn('Card details error:', e.message); }
          }

          await markInvoicePaid(invoiceId, { paymentMethod: 'card', paymentIntentId, last4, brand });
          console.log('✅ Invoice', invoiceId, 'marked as paid');

          // Send confirmation SMS
          const customerPhone = session.customer_details?.phone || '';
          const customerName = session.customer_details?.name || 'Customer';
          const amount = ((session.amount_total || 0) / 100).toFixed(2);
          if (customerPhone) {
            try {
              await fetch('https://app.farritech.com/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: customerPhone, body: `Hi ${customerName}, your payment of $${amount} for invoice #${invoiceNumber} has been received. Thank you! Reply STOP to opt out.` })
              });
            } catch(e) { console.warn('Confirmation SMS error:', e); }
          }
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        const invoiceId = pi.metadata?.invoiceId || '';
        if (invoiceId) {
          await markInvoicePaid(invoiceId, {
            paymentMethod: 'card',
            paymentIntentId: pi.id,
            last4: pi.charges?.data?.[0]?.payment_method_details?.card?.last4 || '',
            brand: pi.charges?.data?.[0]?.payment_method_details?.card?.brand || '',
          });
          console.log('✅ Invoice', invoiceId, 'marked paid via payment_intent');
        }
      }

      return res.status(200).json({ received: true });
    } catch(err) {
      console.error('❌ Webhook error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── NORMAL PAYMENT ACTIONS PATH ──
  try {
    const body = JSON.parse(rawBody.toString());
    const { action, paymentMethodId, amount, currency = 'usd', farrierId, invoiceId, invoiceNumber, customerEmail, customerName, stripeSecretKey } = body || {};

    if (!stripeSecretKey) return res.status(400).json({ success: false, error: 'No Stripe key configured. Please add your Stripe secret key in Settings → Stripe Payments.' });
    if (!stripeSecretKey.startsWith('sk_')) return res.status(400).json({ success: false, error: 'Invalid Stripe secret key format. Key must start with sk_' });

    const stripe = new Stripe(stripeSecretKey);

    if (action === 'charge') {
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
        description: `FarriTech Invoice #${invoiceNumber}`,
        metadata: { farrierId, invoiceId, invoiceNumber },
        receipt_email: customerEmail || undefined,
        return_url: 'https://app.farritech.com',
      });
      if (pi.status === 'succeeded') {
        let last4 = '', brand = 'Card';
        try {
          const charges = await stripe.charges.list({ payment_intent: pi.id, limit: 1 });
          last4 = charges.data[0]?.payment_method_details?.card?.last4 || '';
          brand = charges.data[0]?.payment_method_details?.card?.brand || 'Card';
          brand = brand.charAt(0).toUpperCase() + brand.slice(1);
        } catch(e) {}
        return res.status(200).json({ success: true, transactionId: pi.id, last4, brand });
      }
      return res.status(400).json({ success: false, error: `Payment status: ${pi.status}` });
    }

    if (action === 'refund') {
      const { transactionId, amount: refundAmount } = body;
      if (!transactionId) return res.status(400).json({ success: false, error: 'Missing transactionId.' });
      const refund = await stripe.refunds.create({ payment_intent: transactionId, amount: refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined });
      return res.status(200).json({ success: true, refundId: refund.id });
    }

    if (action === 'payment_link') {
      if (!amount || !invoiceId) return res.status(400).json({ success: false, error: 'Missing amount or invoiceId.' });
      const amountCents = Math.round(parseFloat(amount) * 100);
      if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
      const price = await stripe.prices.create({
        unit_amount: amountCents, currency: 'usd',
        product_data: { name: `Invoice #${invoiceNumber || invoiceId}`, metadata: { farrierId: farrierId || '', invoiceId } },
      });
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: { type: 'redirect', redirect: { url: 'https://app.farritech.com/customer-portal.html' } },
        metadata: { farrierId: farrierId || '', invoiceId, invoiceNumber: invoiceNumber || '' },
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

    if (action === 'validate') {
      const account = await stripe.accounts.retrieve();
      return res.status(200).json({ success: true, accountName: account.settings?.dashboard?.display_name || account.email || 'Stripe Account' });
    }

    return res.status(400).json({ success: false, error: 'Invalid action.' });
  } catch(err) {
    console.error('stripe-payment error:', err);
    return res.status(400).json({ success: false, error: err?.raw?.message || err?.message || 'Payment processing failed' });
  }
}
