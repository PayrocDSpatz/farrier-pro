import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, paymentMethodId, amount, currency = 'usd', farrierId, invoiceId, invoiceNumber, customerEmail, customerName, stripeSecretKey } = body || {};

    if (!stripeSecretKey) {
      return res.status(400).json({ success: false, error: 'No Stripe key configured. Please add your Stripe secret key in Settings → Stripe Payments.' });
    }

    if (!stripeSecretKey.startsWith('sk_')) {
      return res.status(400).json({ success: false, error: 'Invalid Stripe secret key format.' });
    }

    const stripe = new Stripe(stripeSecretKey);

    if (action === 'charge') {
      if (!paymentMethodId || !amount) {
        return res.status(400).json({ success: false, error: 'Missing paymentMethodId or amount.' });
      }

      const amountCents = Math.round(parseFloat(amount) * 100);
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount.' });
      }

      // Create or find customer
      let customerId;
      if (customerEmail) {
        const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        } else {
          const customer = await stripe.customers.create({
            email: customerEmail,
            name: customerName || undefined,
            metadata: { farrierId, source: 'FarriTech' }
          });
          customerId = customer.id;
        }
      }

      // Attach payment method to customer
      if (customerId) {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      }

      // Create payment intent and confirm immediately
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        payment_method: paymentMethodId,
        customer: customerId || undefined,
        confirm: true,
        description: `FarriTech Invoice #${invoiceNumber}`,
        metadata: { farrierId, invoiceId, invoiceNumber },
        receipt_email: customerEmail || undefined,
        return_url: 'https://app.farritech.com',
      });

      if (paymentIntent.status === 'succeeded') {
        return res.status(200).json({
          success: true,
          transactionId: paymentIntent.id,
          last4: paymentIntent.payment_method_details?.card?.last4 || '',
          brand: paymentIntent.payment_method_details?.card?.brand || 'card',
        });
      } else {
        return res.status(400).json({ success: false, error: `Payment status: ${paymentIntent.status}` });
      }
    }

    if (action === 'refund') {
      const { transactionId, amount: refundAmount } = body;
      if (!transactionId) return res.status(400).json({ success: false, error: 'Missing transactionId.' });

      const refund = await stripe.refunds.create({
        payment_intent: transactionId,
        amount: refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined,
      });

      return res.status(200).json({ success: true, refundId: refund.id });
    }

    if (action === 'validate') {
      // Just validate the key works by fetching account info
      const account = await stripe.accounts.retrieve();
      return res.status(200).json({ success: true, accountName: account.settings?.dashboard?.display_name || account.email || 'Stripe Account' });
    }

    return res.status(400).json({ success: false, error: 'Invalid action.' });

  } catch (err) {
    console.error('stripe-payment error:', err);
    const msg = err?.raw?.message || err?.message || 'Payment processing failed';
    return res.status(400).json({ success: false, error: msg });
  }
}
