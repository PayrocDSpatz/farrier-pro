// Vercel serverless function for sending SMS via Twilio
// api/send-sms.js
//
// Only signed-in farriers (or the server itself, e.g. payment confirmations) may send —
// otherwise anyone could text any number on FarriTech's Twilio account.
//
// action: 'new-signup' — sent by the app right after a new farrier account is created.
// Texts the FarriTech owner (ADMIN_ALERT_PHONE) and emails them (STATS_EMAIL_TO) once
// per account; signupNotifiedAt on the profile stops repeats.
import { callerFromRequest, isFarrier, getDoc, patchDoc } from './_lib/firebase-rest.js';

const toE164 = (to) => {
  const phone = String(to).replace(/\D/g, '');
  return phone.startsWith('1') ? `+${phone}` : `+1${phone}`;
};

async function sendTwilio(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
        To: toE164(to),
        Body: body,
      }).toString(),
    }
  );
  return response.json();
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function notifyNewSignup(uid) {
  const profile = await getDoc(`farriers/${uid}`);
  if (!profile) return { skipped: 'no profile' };
  if (profile.signupNotifiedAt) return { skipped: 'already notified' };
  // Mark first so a double call can't text twice.
  await patchDoc(`farriers/${uid}`, { signupNotifiedAt: new Date() });

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const where = [profile.city, profile.state].filter(Boolean).join(', ');
  const lines = [
    `🆕 New FarriTech signup: ${profile.businessName || 'Unnamed business'}`,
    name, profile.email, profile.phone, where,
  ].filter(Boolean);
  const result = {};

  const adminPhone = process.env.ADMIN_ALERT_PHONE;
  if (adminPhone) {
    const sms = await sendTwilio(adminPhone, lines.join('\n')).catch(e => ({ error_code: 'fetch', message: e.message }));
    if (sms.error_code) console.error('new-signup SMS failed:', sms);
    result.sms = sms.error_code ? 'failed' : 'sent';
  } else {
    console.error('new-signup: ADMIN_ALERT_PHONE not set — no text sent');
    result.sms = 'ADMIN_ALERT_PHONE not set';
  }

  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'FarriTech Alerts <welcome@contact.dasdigitalai.com>',
        to: [process.env.STATS_EMAIL_TO || 'david@dasdigitalai.com'],
        subject: `🆕 New FarriTech signup — ${profile.businessName || profile.email || uid}`,
        html: `<p>${lines.map(esc).join('<br>')}</p><p style="color:#94a3b8;font-size:12px;">Farrier ID: ${esc(uid)}</p>`,
      }),
    }).catch(e => ({ ok: false, statusText: e.message }));
    if (!r.ok) console.error('new-signup email failed:', r.status, r.statusText);
    result.email = r.ok ? 'sent' : 'failed';
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await callerFromRequest(req).catch(() => null);
  if (!caller || !(await isFarrier(caller.uid).catch(() => false))) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  if (req.body?.action === 'new-signup') {
    try {
      return res.status(200).json({ success: true, ...(await notifyNewSignup(caller.uid)) });
    } catch (err) {
      console.error('new-signup alert error:', err);
      return res.status(500).json({ error: 'Failed to send signup alert' });
    }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    const { to, body, farrierId } = req.body;

    if (!to || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, body' });
    }

    const data = await sendTwilio(to, body);

    if (data.error_code) {
      console.error('Twilio error:', data);
      return res.status(400).json({ error: data.message, code: data.error_code });
    }

    return res.status(200).json({
      success: true,
      messageSid: data.sid,
      status: data.status,
    });

  } catch (err) {
    console.error('SMS send error:', err);
    return res.status(500).json({ error: 'Failed to send SMS' });
  }
}
