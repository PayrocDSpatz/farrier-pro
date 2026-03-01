// /api/send-booking-emails.js
// Sends two emails after a customer books via the public booking page:
//   1. Notification to the farrier (new appointment request)
//   2. Confirmation to the customer (booking received)
// Uses Resend REST API directly (no npm package needed)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'FarriTech <welcome@contact.dasdigitalai.com>';

const sendEmail = async ({ to, subject, html }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend API error');
  return data;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const {
      // Farrier info
      farrierEmail,
      farrierBusinessName,
      // Customer / booking info
      customerName,
      farmName,
      customerEmail,
      customerPhone,
      services,
      numberOfHorses,
      address,
      city,
      state,
      zip,
      requestedDate,
      requestedTime,
      comments,
    } = req.body || {};

    if (!farrierEmail) return res.status(400).json({ ok: false, error: 'Missing farrierEmail' });

    const servicesList = Array.isArray(services) ? services.join(', ') : (services || 'Not specified');
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ') || 'Not provided';
    const bizName = farrierBusinessName || 'Your Farrier Service';

    // ── Format time nicely ──────────────────────────────────────────────
    const formatTime = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    };

    const displayTime = formatTime(requestedTime);
    const displayDate = requestedDate || '';

    const errors = [];

    // ── 1. Email to FARRIER ─────────────────────────────────────────────
    const farrierHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:30px;background:linear-gradient(135deg,#1a365d 0%,#2563eb 100%);border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">🐴 FarriTech</h1>
    <p style="color:#06b6d4;margin:6px 0 0;font-size:14px;">New Appointment Request</p>
  </div>

  <div style="background:#fff;padding:35px 30px;border:1px solid #e5e7eb;border-top:none;">
    <h2 style="color:#1a365d;margin-top:0;">📋 New Booking Request</h2>
    <p style="color:#4b5563;font-size:15px;">You have a new appointment request on <strong>${bizName}</strong>. Log in to confirm or manage it.</p>

    <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:20px;margin:20px 0;border-radius:4px;">
      <h3 style="color:#1a365d;margin-top:0;font-size:16px;">👤 Customer Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
        <tr><td style="padding:4px 0;width:140px;color:#6b7280;">Name</td><td><strong>${customerName || '—'}</strong></td></tr>
        ${farmName ? `<tr><td style="padding:4px 0;color:#6b7280;">Farm / Business</td><td>${farmName}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td>${customerPhone || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td>${customerEmail || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Address</td><td>${fullAddress}</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:20px;margin:20px 0;border-radius:4px;">
      <h3 style="color:#065f46;margin-top:0;font-size:16px;">📅 Appointment Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
        <tr><td style="padding:4px 0;width:140px;color:#6b7280;">Requested Date</td><td><strong>${displayDate}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Requested Time</td><td><strong>${displayTime}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Services</td><td>${servicesList}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Horses</td><td>${numberOfHorses || '—'}</td></tr>
        ${comments ? `<tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Notes</td><td>${comments}</td></tr>` : ''}
      </table>
    </div>

    <div style="text-align:center;margin:30px 0;">
      <a href="https://farrier-pro.vercel.app" style="background:linear-gradient(135deg,#2563eb 0%,#06b6d4 100%);color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;font-size:16px;">
        View & Confirm Appointment →
      </a>
    </div>
  </div>

  <div style="background:#f9fafb;padding:20px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 FarriTech · <a href="https://farrier-pro.vercel.app" style="color:#6b7280;">farrier-pro.vercel.app</a></p>
  </div>
</body>
</html>`;

    try {
      await sendEmail({
        to: [farrierEmail],
        subject: `🐴 New Booking Request from ${customerName || 'a customer'} — ${displayDate}`,
        html: farrierHtml,
      });
      console.log('✅ Farrier notification email sent to', farrierEmail);
    } catch(e) {
      console.error('❌ Farrier email failed:', e.message);
      errors.push(`Farrier email: ${e.message}`);
    }

    // ── 2. Email to CUSTOMER ────────────────────────────────────────────
    if (customerEmail) {
      const customerHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:30px;background:linear-gradient(135deg,#1a365d 0%,#2563eb 100%);border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">🐴 ${bizName}</h1>
    <p style="color:#06b6d4;margin:6px 0 0;font-size:14px;">Booking Confirmation</p>
  </div>

  <div style="background:#fff;padding:35px 30px;border:1px solid #e5e7eb;border-top:none;">
    <h2 style="color:#1a365d;margin-top:0;">Thanks, ${customerName?.split(' ')[0] || 'there'}! 👋</h2>
    <p style="color:#4b5563;font-size:15px;">Your appointment request with <strong>${bizName}</strong> has been received. We'll be in touch to confirm your booking.</p>

    <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:20px;margin:25px 0;border-radius:4px;">
      <h3 style="color:#1a365d;margin-top:0;font-size:16px;">📅 Your Requested Appointment</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
        <tr><td style="padding:4px 0;width:130px;color:#6b7280;">Date</td><td><strong>${displayDate}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Time</td><td><strong>${displayTime}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Services</td><td>${servicesList}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Horses</td><td>${numberOfHorses || '—'}</td></tr>
        ${comments ? `<tr><td style="padding:4px 0;color:#6b7280;vertical-align:top;">Notes</td><td>${comments}</td></tr>` : ''}
      </table>
    </div>

    <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;margin:20px 0;border-radius:4px;">
      <p style="margin:0;color:#92400e;font-size:14px;">⏳ <strong>Status: Pending Confirmation</strong> — Your farrier will review and confirm your appointment shortly.</p>
    </div>

    <p style="color:#4b5563;font-size:14px;">Questions? Reply to this email or contact us directly.</p>
  </div>

  <div style="background:#f9fafb;padding:20px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 FarriTech · Powered by FarriTech Advanced Farrier Solutions</p>
  </div>
</body>
</html>`;

      try {
        await sendEmail({
          to: [customerEmail],
          subject: `✅ Booking Request Received — ${bizName}`,
          html: customerHtml,
        });
        console.log('✅ Customer confirmation email sent to', customerEmail);
      } catch(e) {
        console.error('❌ Customer email failed:', e.message);
        errors.push(`Customer email: ${e.message}`);
      }
    }

    if (errors.length > 0) {
      console.error('Email errors:', errors);
      return res.status(207).json({ ok: false, errors });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('send-booking-emails error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
