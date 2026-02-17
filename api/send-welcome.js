import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, businessName } = req.body;

  try {
    await resend.emails.send({
      from: 'Farrier Pro <support@farrier-pro.com>',
      to: email,
      subject: `Welcome to Farrier Pro, ${businessName}!`,
      html: `
        <h1>Welcome to Farrier Pro 🐴</h1>
        <p>Your account has been successfully created.</p>
        <p><strong>Business:</strong> ${businessName}</p>
        <p>You can now log in and start managing appointments, invoices, and customers.</p>
        <a href="https://farrier-pro.vercel.app" 
           style="background:#2f5d1f;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;">
           Login to Dashboard
        </a>
        <p style="margin-top:20px;font-size:12px;color:#666;">
          If you didn’t create this account, contact support immediately.
        </p>
      `
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Email failed' });
  }
}
