// Vercel serverless function for sending SMS via Twilio
// api/send-sms.js
//
// Only signed-in farriers (or the server itself, e.g. payment confirmations) may send —
// otherwise anyone could text any number on FarriTech's Twilio account.
import { callerFromRequest, isFarrier, getDoc, patchDoc } from './_lib/firebase-rest.js';

// Who gets a text when a new farrier signs up (FarriTech's owner).
const SIGNUP_ALERT_PHONE = process.env.SIGNUP_ALERT_PHONE || '+19546733041';

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

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    // { alert: 'new_signup' }: the app calls this right after a new farrier's profile is made.
    // The text is built here from their profile (the caller can't choose who gets it or what
    // it says) and sent once per farrier.
    if (req.body?.alert === 'new_signup') {
      const profile = await getDoc(`farriers/${caller.uid}`);
      const created = profile?.createdAt ? new Date(profile.createdAt).getTime() : 0;
      if (!profile || Date.now() - created > 86400e3) return res.status(200).json({ success: false, skipped: 'not a new signup' });
      const secrets = await getDoc(`farrierSecrets/${caller.uid}`).catch(() => null);
      if (secrets?.signupAlertedAt) return res.status(200).json({ success: false, skipped: 'already sent' });
      await patchDoc(`farrierSecrets/${caller.uid}`, { signupAlertedAt: new Date() });
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
      const where = [profile.city, profile.state].filter(Boolean).join(', ');
      const msg = ['🐴 New FarriTech signup', profile.businessName, name, profile.email, profile.phone, where]
        .filter(Boolean).join('\n').slice(0, 600);
      const sent = await twilioSend(accountSid, authToken, messagingServiceSid, SIGNUP_ALERT_PHONE, msg);
      if (sent.error_code) console.error('Twilio error:', sent);
      return res.status(sent.error_code ? 400 : 200).json({ success: !sent.error_code });
    }

    const { to, body, farrierId } = req.body;

    if (!to || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, body' });
    }

    const data = await twilioSend(accountSid, authToken, messagingServiceSid, to, body);

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

async function twilioSend(accountSid, authToken, messagingServiceSid, to, body) {
  // Format phone number to E.164
  const phone = to.replace(/\D/g, '');
  const e164 = phone.startsWith('1') ? `+${phone}` : `+1${phone}`;

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
        MessagingServiceSid: messagingServiceSid,
        To: e164,
        Body: body,
      }).toString(),
    }
  );

  return response.json();
}
