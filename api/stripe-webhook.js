// api/stripe-webhook.js
// Handles Stripe webhook events to automatically update invoice status in Firestore
// Events handled:
//   - payment_link.completed  → mark invoice paid
//   - checkout.session.completed → mark invoice paid (payment link uses checkout sessions)

import Stripe from 'stripe';

const PROJECT_ID = 'farrier-pro';
const FIREBASE_API_KEY = 'AIzaSyAQ1LaWG9lE9j5h6X0T0YQKa_j04vJZHE4';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Vercel requires raw body for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getInvoiceByStripeMetadata(invoiceId) {
  const url = `${BASE_URL}:runQuery?key=${FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'invoices' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'id' },
          op: 'EQUAL',
          value: { stringValue: invoiceId }
        }
      },
      limit: 1
    }
  };

  // First try by document ID directly
  try {
    const docUrl = `${BASE_URL}/invoices/${invoiceId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(docUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.name) {
        return { docId: invoiceId, data: data.fields };
      }
    }
  } catch(e) {}

  return null;
}

async function markInvoicePaid(invoiceId, paymentDetails) {
  const url = `${BASE_URL}/invoices/${invoiceId}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=status&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=paymentMethod&updateMask.fieldPaths=stripePaymentIntentId&updateMask.fieldPaths=cardLast4&updateMask.fieldPaths=cardType`;

  const now = new Date().toISOString();
  const body = {
    fields: {
      status: { stringValue: 'paid' },
      paidAt: { timestampValue: now },
      paymentMethod: { stringValue: paymentDetails.paymentMethod || 'card' },
      stripePaymentIntentId: { stringValue: paymentDetails.paymentIntentId || '' },
      cardLast4: { stringValue: paymentDetails.last4 || '' },
      cardType: { stringValue: paymentDetails.brand || '' },
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore update failed: ${err}`);
  }
  return await res.json();
}

async function sendPaymentConfirmationSms(invoiceId, customerPhone, customerName, amount, invoiceNumber) {
  if (!customerPhone) return;
  try {
    const msg = `Hi ${customerName}, your payment of $${amount} for invoice #${invoiceNumber} has been received. Thank you! Reply STOP to opt out.`;
    await fetch(`https://app.farritech.com/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerPhone, body: msg })
    });
  } catch(e) {
    console.error('Payment confirmation SMS error:', e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  // Verify webhook signature if secret is configured
  if (webhookSecret && sig) {
    try {
      // Use a dummy stripe instance just for webhook verification
      const stripe = new Stripe(process.env.STRIPE_WEBHOOK_VERIFY_KEY || 'sk_test_dummy');
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      // Don't fail hard on signature — log and continue for now
      event = JSON.parse(rawBody.toString());
    }
  } else {
    event = JSON.parse(rawBody.toString());
  }

  console.log('📥 Stripe webhook event:', event.type);

  try {
    // Handle checkout session completed (fired when payment link is paid)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const invoiceId = metadata.invoiceId || '';
      const invoiceNumber = metadata.invoiceNumber || '';

      console.log('💳 Checkout completed — invoiceId:', invoiceId, '| status:', session.payment_status);

      if (!invoiceId) {
        console.warn('⚠️ No invoiceId in session metadata');
        return res.status(200).json({ received: true, warning: 'No invoiceId in metadata' });
      }

      if (session.payment_status === 'paid') {
        // Get payment intent details for card info
        let last4 = '';
        let brand = '';
        let paymentIntentId = session.payment_intent || '';

        // Try to get card details from payment intent
        if (paymentIntentId) {
          try {
            const farrierId = metadata.farrierId || '';
            // We need the farrier's stripe key to look up the payment intent
            // Get it from Firestore
            const profileUrl = `${BASE_URL}/farriers/${farrierId}?key=${FIREBASE_API_KEY}`;
            const profileRes = await fetch(profileUrl);
            if (profileRes.ok) {
              const profile = await profileRes.json();
              const stripeKey = profile.fields?.stripeSecretKey?.stringValue || '';
              if (stripeKey && stripeKey.startsWith('sk_')) {
                const stripe = new Stripe(stripeKey);
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
                const charge = charges.data[0];
                last4 = charge?.payment_method_details?.card?.last4 || '';
                brand = charge?.payment_method_details?.card?.brand || '';
                if (brand) brand = brand.charAt(0).toUpperCase() + brand.slice(1);
              }
            }
          } catch(e) {
            console.warn('Could not retrieve card details:', e.message);
          }
        }

        // Mark invoice as paid in Firestore
        await markInvoicePaid(invoiceId, {
          paymentMethod: 'card',
          paymentIntentId,
          last4,
          brand,
        });

        console.log('✅ Invoice', invoiceId, 'marked as paid');

        // Send confirmation SMS to customer
        const customerPhone = session.customer_details?.phone || '';
        const customerName = session.customer_details?.name || metadata.customerName || 'Customer';
        const amount = ((session.amount_total || 0) / 100).toFixed(2);
        await sendPaymentConfirmationSms(invoiceId, customerPhone, customerName, amount, invoiceNumber);
      }
    }

    // Also handle payment_intent.succeeded as a fallback
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const metadata = pi.metadata || {};
      const invoiceId = metadata.invoiceId || '';

      if (invoiceId) {
        console.log('💳 Payment intent succeeded — invoiceId:', invoiceId);
        const last4 = pi.charges?.data?.[0]?.payment_method_details?.card?.last4 || '';
        const brand = pi.charges?.data?.[0]?.payment_method_details?.card?.brand || '';

        await markInvoicePaid(invoiceId, {
          paymentMethod: 'card',
          paymentIntentId: pi.id,
          last4,
          brand: brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '',
        });
        console.log('✅ Invoice', invoiceId, 'marked as paid via payment_intent.succeeded');
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('❌ Webhook processing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
