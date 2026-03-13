import Stripe from 'stripe';
import crypto from 'crypto';

// AES-256-GCM encryption using ENCRYPTION_KEY env var
const ALGO = 'aes-256-gcm';

function getEncryptionKey() {
  const k = process.env.ENCRYPTION_KEY || '';
  if (!k) throw new Error('Missing ENCRYPTION_KEY env var');
  return crypto.createHash('sha256').update(k).digest();
}

export function encryptKey(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptKey(stored) {
  // Raw sk_ key (legacy / not yet encrypted) — return as-is
  if (!stored || stored.startsWith('sk_')) return stored;
  if (!stored.startsWith('enc:')) throw new Error('Invalid key format');
  const [, ivB64, tagB64, encB64] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return decipher.update(Buffer.from(encB64, 'base64'), undefined, 'utf8') + decipher.final('utf8');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, paymentMethodId, amount, currency = 'usd', farrierId, invoiceId, invoiceNumber, customerEmail, customerName, stripeSecretKey: rawKey } = body || {};

    // Decrypt if stored encrypted, pass raw sk_ keys through for validate action
    let stripeSecretKey;
    try {
      stripeSecretKey = rawKey ? decryptKey(rawKey) : null;
    } catch(e) {
      return res.status(400).json({ success: false, error: 'Could not decrypt Stripe key. Please re-save your keys in Settings.' });
    }

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

      if (customerId) {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      }

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
        let last4 = '';
        let brand = 'Card';
        try {
          const charges = await stripe.charges.list({ payment_intent: paymentIntent.id, limit: 1 });
          const charge = charges.data[0];
          last4 = charge?.payment_method_details?.card?.last4 || '';
          brand = charge?.payment_method_details?.card?.brand || 'Card';
          brand = brand.charAt(0).toUpperCase() + brand.slice(1);
        } catch (e) {
          console.error('Could not retrieve charge details:', e.message);
        }
        return res.status(200).json({ success: true, transactionId: paymentIntent.id, last4, brand });
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
      const account = await stripe.accounts.retrieve();
      // Encrypt the key now that we've confirmed it's valid
      const encryptedKey = encryptKey(stripeSecretKey);
      return res.status(200).json({
        success: true,
        accountName: account.settings?.dashboard?.display_name || account.email || 'Stripe Account',
        encryptedKey  // send back to client to store in Firestore instead of plaintext
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid action.' });

  } catch (err) {
    console.error('stripe-payment error:', err);
    const msg = err?.raw?.message || err?.message || 'Payment processing failed';
    return res.status(400).json({ success: false, error: msg });
  }
}
