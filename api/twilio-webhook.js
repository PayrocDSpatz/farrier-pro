// Vercel serverless function - handles incoming SMS replies from customers
// Processes CONFIRM (updates appointment) and STOP (opts customer out)
// api/twilio-webhook.js

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  // Twilio sends POST with form data
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { From, Body } = req.body;
    const reply = (Body || '').trim().toUpperCase();
    const phone = (From || '').replace(/\D/g, '');

    // Always respond with TwiML (empty = no reply text, unless we want to confirm)
    const twiml = (msg) => `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`;

    const db = getDb();

    if (reply === 'STOP') {
      // Find customer by phone number and set smsOptOut: true
      // Search across all farriers
      const customersSnap = await db.collectionGroup('customers')
        .where('phone', '==', phone)
        .get();

      // Also try with +1 prefix stripped versions
      const phoneVariants = [phone, phone.replace(/^1/, ''), `1${phone}`];

      let updated = 0;
      for (const variant of phoneVariants) {
        const snap = await db.collection('customers')
          .where('phone', '==', variant)
          .get();
        for (const doc of snap.docs) {
          await doc.ref.update({ smsOptOut: true });
          updated++;
        }
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml('You have been unsubscribed and will no longer receive messages. Reply START to resubscribe.'));
    }

    if (reply === 'START') {
      // Re-subscribe customer
      const phoneVariants = [phone, phone.replace(/^1/, ''), `1${phone}`];
      for (const variant of phoneVariants) {
        const snap = await db.collection('customers')
          .where('phone', '==', variant)
          .get();
        for (const doc of snap.docs) {
          await doc.ref.update({ smsOptOut: false });
        }
      }
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml('You have been resubscribed and will receive appointment and invoice notifications.'));
    }

    if (reply === 'CONFIRM') {
      // Find upcoming appointments for this customer phone and mark as confirmed
      const phoneVariants = [phone, phone.replace(/^1/, ''), `1${phone}`];
      let confirmed = 0;

      for (const variant of phoneVariants) {
        // Find customers with this phone
        const custSnap = await db.collection('customers')
          .where('phone', '==', variant)
          .get();

        for (const custDoc of custSnap.docs) {
          const customerName = custDoc.data().name;
          const farrierId = custDoc.data().farrierId;

          if (!farrierId) continue;

          // Find upcoming unconfirmed appointments for this customer
          const now = new Date();
          const apptSnap = await db.collection('appointments')
            .where('farrierId', '==', farrierId)
            .where('customerName', '==', customerName)
            .where('status', 'in', ['scheduled', 'pending', 'confirmed'])
            .get();

          for (const apptDoc of apptSnap.docs) {
            const appt = apptDoc.data();
            // Only confirm future appointments
            const apptDate = appt.date?.toDate ? appt.date.toDate() : new Date(appt.date);
            if (apptDate >= now && appt.status !== 'confirmed_by_customer') {
              await apptDoc.ref.update({ status: 'confirmed_by_customer' });
              confirmed++;
            }
          }
        }
      }

      if (confirmed > 0) {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(twiml('Thank you! Your appointment has been confirmed.'));
      } else {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(twiml('Thank you for your reply. We could not find an upcoming appointment to confirm. Please contact your farrier directly.'));
      }
    }

    if (reply === 'HELP') {
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml('FarriTech: For help contact support@farritech.app. Reply STOP to unsubscribe. Msg&Data rates may apply.'));
    }

    // Unrecognized reply - just acknowledge
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml(''));

  } catch (err) {
    console.error('Webhook error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
}
