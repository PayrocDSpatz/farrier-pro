// Google Calendar OAuth for the signed-in farrier.
// api/google-calendar-auth.js
//
// The refresh token never reaches a browser: it is exchanged and stored here, in the
// locked farrierSecrets collection (see _lib/firebase-rest.js). The dashboard asks for a
// short-lived access token whenever it needs to talk to Google Calendar.
//
// All actions need the farrier's Firebase ID token (Authorization: Bearer <token>,
// added by api-auth.js):
//   connect    { code }  → exchange a popup authorization code, store the refresh token
//   token                → fresh access token from the stored refresh token
//   disconnect           → revoke at Google and forget the token

import { callerFromRequest, patchDoc, getGoogleRefreshToken, setGoogleRefreshToken } from './_lib/firebase-rest.js';

async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Google Calendar is not configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' });
    }
    const caller = await callerFromRequest(req);
    if (!caller) return res.status(401).json({ success: false, error: 'Please sign in again.' });
    const farrierId = caller.uid;
    const action = req.body?.action || req.query?.action;

    if (action === 'connect') {
      const code = req.body?.code;
      if (!code) return res.status(400).json({ success: false, error: 'Missing authorization code.' });
      // Popup code flow: Google requires the literal redirect_uri "postmessage".
      const { ok, data } = await googleToken({ code, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
      if (!ok) return res.status(400).json({ success: false, error: data.error_description || data.error || 'Google sign-in failed.' });

      // Google only sends a refresh token on first consent; keep the old one otherwise.
      const refreshToken = data.refresh_token || await getGoogleRefreshToken(farrierId);
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'Google did not grant offline access. Please try connecting again.' });
      }
      await setGoogleRefreshToken(farrierId, refreshToken);

      let email = '';
      try {
        const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${data.access_token}` } });
        if (me.ok) email = (await me.json()).email || '';
      } catch (e) { /* email is display-only */ }
      await patchDoc(`farriers/${farrierId}`, { googleCalendarConnected: true, googleCalendarEmail: email });

      return res.status(200).json({ success: true, accessToken: data.access_token, expiresIn: data.expires_in, email });
    }

    if (action === 'token') {
      const refreshToken = await getGoogleRefreshToken(farrierId);
      if (!refreshToken) return res.status(200).json({ success: false, needsReconnect: true, error: 'Reconnect Google Calendar in Settings.' });
      const { ok, data } = await googleToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });
      if (!ok) {
        // invalid_grant = the farrier revoked access in their Google account.
        if (data.error === 'invalid_grant') {
          await setGoogleRefreshToken(farrierId, '');
          await patchDoc(`farriers/${farrierId}`, { googleCalendarConnected: false });
          return res.status(200).json({ success: false, needsReconnect: true, error: 'Google access was revoked. Reconnect Google Calendar in Settings.' });
        }
        return res.status(502).json({ success: false, error: data.error_description || data.error || 'Token refresh failed.' });
      }
      return res.status(200).json({ success: true, accessToken: data.access_token, expiresIn: data.expires_in });
    }

    if (action === 'disconnect') {
      const refreshToken = await getGoogleRefreshToken(farrierId);
      if (refreshToken) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        }).catch(() => {});
      }
      await setGoogleRefreshToken(farrierId, '');
      await patchDoc(`farriers/${farrierId}`, { googleCalendarConnected: false }, ['googleCalendarEmail']);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (error) {
    console.error('Google Calendar auth error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
