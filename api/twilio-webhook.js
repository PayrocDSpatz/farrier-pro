// Vercel serverless function - handles incoming SMS replies from customers
// Processes CONFIRM (updates appointment) and STOP (opts customer out)
// Uses Firebase REST API - no service account / private key needed
// api/twilio-webhook.js

const PROJECT_ID = 'farrier-pro';

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function firestoreQuery(collection, filters, apiKey) {
  const structuredQuery = {
    from: [{ collectionId: collection }],
    where: filters.length === 1 ? {
      fieldFilter: {
        field: { fieldPath: filters[0].field },
        op: 'EQUAL',
        value: { stringValue: filters[0].value }
      }
    } : {
      compositeFilter: {
        op: 'AND',
        filters: filters.map(f => ({
          fieldFilter: {
            field: { fieldPath: f.field },
            op: 'EQUAL',
            value: { stringValue: f.value }
          }
        }))
      }
    }
  };

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery })
    }
  );
  const data = await res.json();
  return Array.isArray(data) ? data.filter(d => d.document) : [];
}

async function firestorePatch(docName, fields, apiKey) {
  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
    else if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
  }
  const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  await fetch(
    `https://firestore.googleapis.com/v1/${docName}?${updateMask}&key=${apiKey}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: firestoreFields })
    }
  );
}

function getStr(doc, field) {
  return doc.document?.fields?.[field]?.stringValue || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const twiml = (msg) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`;

  res.setHeader('Content-Type', 'text/xml');

  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      console.error('FIREBASE_API_KEY not set');
      return res.status(200).send(twiml(''));
    }

    const { From, Body } = req.body;
    const reply = (Body || '').trim().toUpperCase();
    const rawPhone = (From || '').replace(/\D/g, '');
    const phoneVariants = [rawPhone, rawPhone.replace(/^1/, ''), `1${rawPhone.replace(/^1/, '')}`];

    if (reply === 'STOP') {
      for (const phone of phoneVariants) {
        const docs = await firestoreQuery('customers', [{ field: 'phone', value: phone }], apiKey);
        for (const d of docs) {
          await firestorePatch(d.document.name, { smsOptOut: true }, apiKey);
        }
      }
      return res.status(200).send(twiml('You have been unsubscribed. Reply START to resubscribe.'));
    }

    if (reply === 'START') {
      for (const phone of phoneVariants) {
        const docs = await firestoreQuery('customers', [{ field: 'phone', value: phone }], apiKey);
        for (const d of docs) {
          await firestorePatch(d.document.name, { smsOptOut: false }, apiKey);
        }
      }
      return res.status(200).send(twiml('You have been resubscribed and will receive appointment and invoice notifications.'));
    }

    if (reply === 'CONFIRM') {
      let confirmed = 0;
      for (const phone of phoneVariants) {
        const custDocs = await firestoreQuery('customers', [{ field: 'phone', value: phone }], apiKey);
        for (const custDoc of custDocs) {
          const customerName = getStr(custDoc, 'name');
          const farrierId = getStr(custDoc, 'farrierId');
          if (!farrierId || !customerName) continue;

          const apptDocs = await firestoreQuery('appointments', [
            { field: 'farrierId', value: farrierId },
            { field: 'customerName', value: customerName },
          ], apiKey);

          for (const apptDoc of apptDocs) {
            const status = getStr(apptDoc, 'status');
            const dateStr = getStr(apptDoc, 'requestedDate');
            if (['scheduled', 'pending', 'confirmed'].includes(status)) {
              const apptDate = new Date(dateStr);
              if (!dateStr || apptDate >= new Date()) {
                await firestorePatch(apptDoc.document.name, { status: 'confirmed_by_customer' }, apiKey);
                confirmed++;
              }
            }
          }
        }
      }
      return res.status(200).send(twiml(
        confirmed > 0
          ? 'Thank you! Your appointment has been confirmed.'
          : 'We could not find an upcoming appointment to confirm. Please contact your farrier directly.'
      ));
    }

    if (reply === 'HELP') {
      return res.status(200).send(twiml('FarriTech: For help contact support@farritech.app. Reply STOP to unsubscribe. Msg & Data rates may apply.'));
    }

    return res.status(200).send(twiml(''));

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).send(twiml(''));
  }
}
