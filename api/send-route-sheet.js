// /api/send-route-sheet.js
// Sends the farrier's daily route sheet to their own email address via Resend.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'FarriTech <welcome@contact.dasdigitalai.com>';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { to, subject, html } = req.body || {};

    if (!to) return res.status(400).json({ ok: false, error: 'Missing recipient email' });
    if (!html) return res.status(400).json({ ok: false, error: 'Missing route sheet HTML' });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: subject || 'Your FarriTech Route Sheet',
        html,
      }),
    });

    const data = await emailRes.json();
    if (!emailRes.ok) throw new Error(data.message || 'Resend API error');

    return res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    console.error('send-route-sheet error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
