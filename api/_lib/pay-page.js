// The customer-facing pay link: https://app.farritech.com/pay/{invoiceId}
// (vercel.json rewrites /pay/:id to /api/stripe-payment?payPage=1&invoice=:id — it runs
// inside stripe-payment because the Hobby plan allows only 12 functions per deploy)
//
// Checkout Sessions expire after 24 hours, so customers never get one directly. This
// link sends them to the invoice's open session if it's still good for the right
// amount, otherwise makes a new one. Stripe sends them back here afterwards with
// ?session_id=…, and we record the payment right away (the webhook does the same,
// whichever comes first wins; both are idempotent).
import Stripe from 'stripe';
import '../../lib/pricing.js';
import { getDoc, getStripeSecretKey } from './firebase-rest.js';
import { createCheckoutSession, recordCheckoutSession, escapeHtml } from './invoice-payments.js';

const P = globalThis.FarriPricing;

function page(res, status, title, message, extra = '') {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --text:#1e293b; --muted:#64748b; --accent:#059669; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f172a; --card:#1e293b; --text:#e2e8f0; --muted:#94a3b8; } }
  body { margin:0; padding:16px; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; }
  .card { max-width:440px; margin:12vh auto 0; background:var(--card); border-radius:12px; padding:32px 24px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,.08); }
  h1 { font-size:1.4rem; margin:0 0 .5rem; } p { color:var(--muted); line-height:1.5; }
  a.btn { display:inline-block; margin-top:1rem; background:var(--accent); color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:700; }
  .foot { margin-top:2rem; font-size:.75rem; color:var(--muted); }
</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${extra}<div class="foot">Powered by FarriTech</div></div></body></html>`);
}

export async function payPage(req, res) {
  const invoiceId = String(req.query?.invoice || '');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(invoiceId)) return page(res, 404, 'Invoice not found', 'This payment link is not valid. Please contact your farrier.');

  try {
    const invoice = await getDoc(`invoices/${invoiceId}`);
    if (!invoice) return page(res, 404, 'Invoice not found', 'This payment link is not valid. Please contact your farrier.');
    const number = invoice.invoiceNumber || '';
    const key = await getStripeSecretKey(invoice.farrierId);

    // Back from Stripe Checkout
    const sessionId = String(req.query?.session_id || '');
    if (sessionId && key) {
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
      if (session && session.metadata?.invoiceId === invoiceId && session.payment_status === 'paid') {
        await recordCheckoutSession(stripe, invoice.farrierId, session);
        return page(res, 200, 'Payment received', `Thank you! Your payment of ${P.money(session.amount_total)} for Invoice #${number} has been received.`);
      }
    }

    if (invoice.status === 'paid') return page(res, 200, 'Invoice paid', `Invoice #${number} has already been paid. Thank you!`);
    if (invoice.status === 'cancelled') return page(res, 200, 'Invoice cancelled', `Invoice #${number} was cancelled. Please contact your farrier with any questions.`);
    if (!key) return page(res, 200, 'Online payment unavailable', 'Your farrier is not set up for online payments right now. Please contact them to pay.');

    const stripe = new Stripe(key);
    const expected = P.getChargeCents(invoice, 'card_link');
    if (expected <= 0) return page(res, 200, 'Nothing owed', `There's no balance due on Invoice #${number}.`);

    // Reuse the open session if it's still for the right amount.
    if (invoice.checkoutSessionId) {
      const current = await stripe.checkout.sessions.retrieve(invoice.checkoutSessionId).catch(() => null);
      if (current?.status === 'complete' && current.payment_status === 'paid') {
        await recordCheckoutSession(stripe, invoice.farrierId, current);
        return page(res, 200, 'Invoice paid', `Invoice #${number} has already been paid. Thank you!`);
      }
      if (current?.status === 'open' && current.amount_total === expected && current.url && !req.query?.canceled) {
        res.setHeader('Cache-Control', 'no-store');
        return res.redirect(303, current.url);
      }
      if (req.query?.canceled) {
        return page(res, 200, 'Payment not completed', `Your payment for Invoice #${number} wasn't completed.`, `<a class="btn" href="/pay/${encodeURIComponent(invoiceId)}">Pay ${P.money(expected)}</a>`);
      }
    }

    const { session } = await createCheckoutSession(stripe, invoiceId, invoice);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('pay link error:', invoiceId, err);
    return page(res, 500, 'Something went wrong', 'We couldn’t open the payment page. Please try again in a minute, or contact your farrier.');
  }
}
