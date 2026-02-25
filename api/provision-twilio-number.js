// Vercel serverless function - provisions a dedicated Twilio phone number for a farrier
// Called when farrier activates SMS add-on
// api/provision-twilio-number.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    const { farrierId, areaCode } = req.body;
    if (!farrierId) return res.status(400).json({ error: 'farrierId required' });

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Search for available local numbers - try requested area code or default to 561
    const searchAreaCode = areaCode || '561';
    const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${searchAreaCode}&SmsEnabled=true&MmsEnabled=false&Limit=1`;

    const searchRes = await fetch(searchUrl, { headers });
    const searchData = await searchRes.json();

    let phoneNumber;
    if (searchData.available_phone_numbers && searchData.available_phone_numbers.length > 0) {
      phoneNumber = searchData.available_phone_numbers[0].phone_number;
    } else {
      // Fallback - search any US number
      const fallbackUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&Limit=1`;
      const fallbackRes = await fetch(fallbackUrl, { headers });
      const fallbackData = await fallbackRes.json();
      if (!fallbackData.available_phone_numbers?.length) {
        return res.status(500).json({ error: 'No available phone numbers found' });
      }
      phoneNumber = fallbackData.available_phone_numbers[0].phone_number;
    }

    // Purchase the number
    const purchaseRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          PhoneNumber: phoneNumber,
          SmsUrl: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://farrier-pro.vercel.app'}/api/twilio-webhook`,
          SmsMethod: 'POST',
          FriendlyName: `FarriTech - ${farrierId}`,
        }).toString(),
      }
    );

    const purchaseData = await purchaseRes.json();

    if (purchaseData.error_code) {
      return res.status(400).json({ error: purchaseData.message });
    }

    // Add the number to the Messaging Service
    await fetch(
      `https://api.twilio.com/2010-04-01/Services/${messagingServiceSid}/PhoneNumbers.json`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          PhoneNumberSid: purchaseData.sid,
        }).toString(),
      }
    );

    return res.status(200).json({
      success: true,
      phoneNumber: purchaseData.phone_number,
      phoneNumberSid: purchaseData.sid,
    });

  } catch (err) {
    console.error('Provision error:', err);
    return res.status(500).json({ error: 'Failed to provision phone number' });
  }
}
