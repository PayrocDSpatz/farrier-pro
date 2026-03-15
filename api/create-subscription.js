// Subscriptions are handled by the landing page repo (api/create-subscription.js)
// via Stripe. This file is kept as a placeholder only.

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(410).json({
    success: false,
    message: 'This endpoint is no longer active. Subscriptions are managed via Stripe on the landing page.',
  });
}
