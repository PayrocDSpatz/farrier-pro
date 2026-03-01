// /api/send-cancellation-email.js
// Sent to the customer when the farrier cancels their appointment
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'FarriTech <welcome@contact.dasdigitalai.com>';

const sendEmail = async ({ to, subject, html, replyTo }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend API error');
  return data;
};

const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const {
      customerEmail,
      customerName,
      farmName,
      farrierBusinessName,
      farrierEmail,
      farrierPhone,
      requestedDate,
      requestedTime,
      services,
    } = req.body || {};

    if (!customerEmail) return res.status(400).json({ ok: false, error: 'Missing customerEmail' });

    const bizName = farrierBusinessName || 'Your Farrier Service';
    const servicesList = Array.isArray(services) ? services.join(', ') : (services || 'Not specified');
    const displayTime = formatTime(requestedTime);
    const firstName = customerName?.split(' ')[0] || 'there';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">

  <!-- Header -->
  <div style="text-align:center;padding:30px;background:linear-gradient(135deg,#7f1d1d 0%,#ef4444 100%);border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">🐴 ${bizName}</h1>
    <p style="color:#fecaca;margin:8px 0 0;font-size:15px;font-weight:600;">Appointment Cancellation Notice</p>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:35px 30px;border:1px solid #e5e7eb;border-top:none;">

    <h2 style="color:#1a365d;margin-top:0;">Hi ${firstName},</h2>
    <p style="color:#4b5563;font-size:15px;">
      We're sorry to let you know that your appointment with <strong>${bizName}</strong> has been <strong>cancelled</strong>.
    </p>

    <!-- Cancelled appointment box -->
    <div style="background:#fef2f2;border:2px solid #ef4444;padding:24px;margin:24px 0;border-radius:8px;">
      <h3 style="color:#991b1b;margin-top:0;font-size:17px;">✕ Cancelled Appointment</h3>
      <table style="width:100%;border-collapse:collapse;font-size:15px;color:#374151;">
        <tr>
          <td style="padding:6px 0;width:130px;color:#6b7280;">Date</td>
          <td><strong>${requestedDate || '—'}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">Time</td>
          <td><strong>${displayTime}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;">Services</td>
          <td>${servicesList}</td>
        </tr>
        ${farmName ? `
        <tr>
          <td style="padding:6px 0;color:#6b7280;">Farm / Business</td>
          <td>${farmName}</td>
        </tr>` : ''}
      </table>
    </div>

    <p style="color:#4b5563;font-size:15px;">
      We apologize for any inconvenience. Please contact us to reschedule at your earliest convenience.
    </p>

    <!-- Contact farrier -->
    <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:18px 20px;margin:20px 0;border-radius:4px;">
      <h3 style="color:#1a365d;margin-top:0;font-size:15px;">📞 Contact us to reschedule</h3>
      ${farrierPhone ? `<p style="margin:4px 0;color:#4b5563;font-size:14px;">📱 ${farrierPhone}</p>` : ''}
      ${farrierEmail ? `<p style="margin:4px 0;font-size:14px;"><a href="mailto:${farrierEmail}" style="color:#2563eb;text-decoration:none;">✉️ ${farrierEmail}</a></p>` : ''}
      <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Or simply reply to this email.</p>
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#f9fafb;padding:20px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      © 2026 FarriTech · Powered by <a href="https://farrier-pro.vercel.app" style="color:#6b7280;">FarriTech</a>
    </p>
  </div>

</body>
</html>`;

    await sendEmail({
      to: customerEmail,
      subject: `Appointment Cancellation — ${bizName} on ${requestedDate}`,
      html,
      replyTo: farrierEmail || undefined,
    });

    console.log('✅ Cancellation email sent to', customerEmail);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('send-cancellation-email error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
