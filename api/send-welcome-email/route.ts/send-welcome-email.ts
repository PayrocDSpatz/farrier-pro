import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, firstName, businessName } = await request.json();

    const { data, error } = await resend.emails.send({
      from: 'FarriTech <welcome@contact.dasdigitalai.com>',
      to: [email],
      subject: 'Welcome to FarriTech! 🐴',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            
            <!-- Header with Logo -->
            <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700;">FarriTech</h1>
              <p style="color: #06b6d4; margin: 5px 0 0 0; font-size: 14px;">Managing your farrier business makes sense</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="color: #1a365d; margin-top: 0;">Welcome aboard, ${firstName}! 👋</h2>
              
              <p style="font-size: 16px; color: #4b5563;">
                Thanks for joining FarriTech! We're excited to help you streamline ${businessName || 'your farrier business'} and take control of your operations.
              </p>

              <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0; border-radius: 4px;">
                <h3 style="color: #1a365d; margin-top: 0; font-size: 18px;">🚀 Quick Start Guide</h3>
                <ul style="color: #4b5563; margin: 15px 0; padding-left: 20px;">
                  <li style="margin-bottom: 10px;"><strong>Complete your profile:</strong> Add your business details and service areas</li>
                  <li style="margin-bottom: 10px;"><strong>Add your first client:</strong> Import existing clients or create new ones</li>
                  <li style="margin-bottom: 10px;"><strong>Set your schedule:</strong> Configure your availability and start booking appointments</li>
                  <li style="margin-bottom: 10px;"><strong>Create your first invoice:</strong> Get paid faster with professional invoicing</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 35px 0;">
                <a href="https://app.farritech.com/dashboard" style="background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">
                  Go to Dashboard →
                </a>
              </div>

              <div style="border-top: 1px solid #e5e7eb; padding-top: 25px; margin-top: 35px;">
                <h3 style="color: #1a365d; font-size: 18px;">Need Help?</h3>
                <p style="color: #4b5563;">
                  We're here to support you every step of the way:
                </p>
                <ul style="color: #4b5563; padding-left: 20px;">
                  <li style="margin-bottom: 8px;">📚 Check out our <a href="https://farritech.com/help" style="color: #2563eb; text-decoration: none;">Help Center</a></li>
                  <li style="margin-bottom: 8px;">💬 Contact support at <a href="mailto:support@farritech.com" style="color: #2563eb; text-decoration: none;">support@farritech.com</a></li>
                  <li style="margin-bottom: 8px;">🎥 Watch our <a href="https://farritech.com/tutorials" style="color: #2563eb; text-decoration: none;">video tutorials</a></li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 25px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                FarriTech - Professional Business Management for Farriers
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                © 2025 FarriTech. All rights reserved.
              </p>
            </div>

          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return NextResponse.json(
      { error: 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
