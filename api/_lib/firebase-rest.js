// Server-side Firestore access for the api/ functions.
//
// Google blocks service-account key downloads on this project (org policy), so the
// server doesn't use firebase-admin. Instead it signs in as a dedicated Firebase Auth
// user (SERVER_AUTH_EMAIL / SERVER_AUTH_PASSWORD in Vercel env) whose uid the Firestore
// rules grant exactly what the server needs — the locked farrierSecrets collection,
// reading farrier profiles, and marking invoices paid. Nothing else.
//
// Files under api/_lib are helpers, not deployed as endpoints (underscore prefix).

const PROJECT_ID = 'farrier-pro';
// The web API key is public (it ships in every page); env var preferred if set.
const API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAQ1LaWG9lE9j5h6X0T0YQKa_j04vJZHE4';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const IDT = 'https://identitytoolkit.googleapis.com/v1';

// ── Server identity ──
let cached = null; // { idToken, uid, expiresAt }
export async function serverAuth() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  const email = process.env.SERVER_AUTH_EMAIL, password = process.env.SERVER_AUTH_PASSWORD;
  if (!email || !password) throw new Error('SERVER_AUTH_EMAIL / SERVER_AUTH_PASSWORD not configured');
  const r = await fetch(`${IDT}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Server sign-in failed: ' + (d.error?.message || r.status));
  cached = { idToken: d.idToken, uid: d.localId, expiresAt: Date.now() + Number(d.expiresIn || 3600) * 1000 };
  return cached;
}

// ── Caller identity ──
// Verifies a Firebase ID token from the Authorization header (Bearer <token>) with
// Firebase itself. Returns { uid, email } or null.
export async function callerFromRequest(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const idToken = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!idToken) return null;
  const r = await fetch(`${IDT}/accounts:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const u = (await r.json()).users?.[0];
  return u ? { uid: u.localId, email: (u.email || '').toLowerCase(), idToken } : null;
}

// ── Firestore value encoding ──
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
}
function dec(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return undefined;
}

// ── Firestore document helpers (run as the server user) ──
export async function getDoc(path) {
  const { idToken } = await serverAuth();
  const r = await fetch(`${DOCS}/${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore read ${path} failed: ${r.status} (server uid ${cached?.uid}) ${await r.text()}`);
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)]));
}

// Lists a collection (all pages). Returns [{ id, ...fields }]. Optional field mask.
export async function listDocs(collection, fieldMask = []) {
  const { idToken } = await serverAuth();
  const out = [];
  let pageToken = '';
  do {
    const qs = [`pageSize=300`, ...fieldMask.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`), pageToken ? `pageToken=${pageToken}` : ''].filter(Boolean).join('&');
    const r = await fetch(`${DOCS}/${collection}?${qs}`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!r.ok) throw new Error(`Firestore list ${collection} failed: ${r.status} (server uid ${cached?.uid}) ${await r.text()}`);
    const d = await r.json();
    for (const doc of d.documents || []) {
      out.push({ id: doc.name.split('/').pop(), ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, dec(v)])) });
    }
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  return out;
}

// Writes only the given fields (merge). `deleteFields` removes fields. Creates the doc if missing.
export async function patchDoc(path, fields = {}, deleteFields = []) {
  const { idToken } = await serverAuth();
  const mask = [...Object.keys(fields), ...deleteFields].map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) };
  const r = await fetch(`${DOCS}/${path}?${mask}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firestore write ${path} failed: ${r.status} (server uid ${cached?.uid}) ${await r.text()}`);
  return true;
}

// ── Payment secrets ──
// farrierSecrets/{uid} is denied to every browser by the rules; only the server user
// can read or write it. Shaped to hold other processors (e.g. Stax) alongside Stripe.
//
// Legacy: secret keys used to live on the public farriers/{uid} profile. The first time
// the server needs a farrier's key it moves it here and deletes it from the profile.
export async function getStripeSecretKey(farrierId) {
  if (!farrierId) return '';
  const secrets = await getDoc(`farrierSecrets/${farrierId}`);
  if (secrets?.stripeSecretKey) return secrets.stripeSecretKey;
  const profile = await getDoc(`farriers/${farrierId}`);
  const legacy = profile?.stripeSecretKey || '';
  if (legacy && legacy.startsWith('sk_')) {
    await patchDoc(`farrierSecrets/${farrierId}`, { stripeSecretKey: legacy, migratedAt: new Date() });
    await patchDoc(`farriers/${farrierId}`, {}, ['stripeSecretKey']);
    return legacy;
  }
  return '';
}

export async function setStripeSecretKey(farrierId, key) {
  if (key) await patchDoc(`farrierSecrets/${farrierId}`, { stripeSecretKey: key, updatedAt: new Date() });
  else await patchDoc(`farrierSecrets/${farrierId}`, {}, ['stripeSecretKey']);
  // Never leave a copy on the public profile.
  await patchDoc(`farriers/${farrierId}`, {}, ['stripeSecretKey']);
}

// ── Google Calendar ──
// The refresh token lives in farrierSecrets/{uid}.googleRefreshToken; browsers only ever
// get short-lived access tokens from api/google-calendar-auth.
//
// Legacy: tokens used to sit on the public farriers/{uid} profile. The first time the
// server looks for a farrier's token it moves any refresh token here and deletes every
// Google token field from the profile.
const LEGACY_GOOGLE_FIELDS = ['googleAccessToken', 'googleRefreshToken', 'googleTokenExpiry'];

export async function getGoogleRefreshToken(farrierId) {
  if (!farrierId) return '';
  const secrets = await getDoc(`farrierSecrets/${farrierId}`);
  if (secrets?.googleRefreshToken) return secrets.googleRefreshToken;
  const profile = await getDoc(`farriers/${farrierId}`);
  if (!profile || !LEGACY_GOOGLE_FIELDS.some(f => profile[f])) return '';
  const legacy = profile.googleRefreshToken || '';
  if (legacy) await patchDoc(`farrierSecrets/${farrierId}`, { googleRefreshToken: legacy, googleMigratedAt: new Date() });
  await patchDoc(`farriers/${farrierId}`, {}, LEGACY_GOOGLE_FIELDS);
  return legacy;
}

export async function setGoogleRefreshToken(farrierId, token) {
  if (token) await patchDoc(`farrierSecrets/${farrierId}`, { googleRefreshToken: token, googleUpdatedAt: new Date() });
  else await patchDoc(`farrierSecrets/${farrierId}`, {}, ['googleRefreshToken']);
  // Never leave a copy on the public profile.
  await patchDoc(`farriers/${farrierId}`, {}, LEGACY_GOOGLE_FIELDS);
}

export async function isFarrier(uid) {
  if (!uid) return false;
  const { uid: serverUid } = await serverAuth();
  if (uid === serverUid) return true;
  return !!(await getDoc(`farriers/${uid}`));
}
