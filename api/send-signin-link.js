// api/send-signin-link.js
// Generates a Firebase email sign-in link via Admin SDK and sends it via Resend.
// Requires env vars: FIREBASE_SERVICE_ACCOUNT (JSON string), RESEND_API_KEY

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'FarriTech <noreply@farritech.com>';
const PORTAL_URL = 'https://app.farritech.com/customer-portal.html';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' });

  try {
    // Generate magic link via Firebase Admin
    const app = getAdminApp();
    const adminAuth = getAuth(app);

    const actionCodeSettings = {
      url: PORTAL_URL,
      handleCodeInApp: true,
    };

    const link = await adminAuth.generateSignInWithEmailLink(email, actionCodeSettings);

    // Send branded email via Resend
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:560px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:24px 30px;background:linear-gradient(135deg,#0D1320 0%,#1a2a4a 100%);border-radius:10px 10px 0 0;">
    <img src="https://app.farritech.com/public/farritech_logo_letters_white.png" alt="FarriTech" style="height:50px;width:auto;" />
  </div>
  <div style="background:#fff;padding:32px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <h2 style="margin:0 0 0.5rem;color:#0D1320;font-size:1.4rem;">Your Sign-In Link</h2>
    <p style="color:#6b7280;margin:0 0 1.5rem;font-size:0.95rem;">
      Click the button below to sign in to your FarriTech customer portal and view your invoices. This link expires in 1 hour.
    </p>
    <div style="text-align:center;margin:1.5rem 0;">
      <a href="${link}" style="background:linear-gradient(135deg,#2683FB 0%,#46C5FF 100%);color:#fff;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block;font-size:1rem;">
        Sign In to FarriTech
      </a>
    </div>
    <p style="color:#9ca3af;font-size:0.8rem;text-align:center;margin:1.5rem 0 0;">
      If you didn't request this, you can safely ignore this email.<br/>
      This link can only be used once and expires in 1 hour.
    </p>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:0.75rem;margin-top:1rem;">
    &copy; ${new Date().getFullYear()} FarriTech &mdash; Advanced Farrier Solutions
  </p>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: 'Your FarriTech Sign-In Link',
        html,
      }),
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) throw new Error(emailData.message || 'Resend error');

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('send-signin-link error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send sign-in link' });
  }
}
