# Google Calendar OAuth Refresh Tokens - Setup Guide

## Overview
This implementation adds OAuth refresh tokens so farriers stay connected to Google Calendar permanently without needing to reconnect every hour.

## What Changed

### Before (Token Client - Implicit Flow):
- ❌ Tokens expire after 1 hour
- ❌ Must reconnect manually every hour
- ❌ No refresh tokens

### After (Authorization Code Flow with Refresh Tokens):
- ✅ Refresh tokens never expire
- ✅ Access tokens auto-refresh before expiry
- ✅ Stay connected permanently
- ✅ Professional user experience

---

## Setup Instructions

### Step 1: Update Google Cloud Console

1. **Go to** [Google Cloud Console](https://console.cloud.google.com/)
2. **Select** farritech project
3. **Click** "Credentials"
4. **Click** on your OAuth Client ID

5. **Add Redirect URI:**
   ```
   https://farritech.vercel.app/oauth-callback
   ```
   (Add both your production and preview URLs if needed)

6. **Note your credentials:**
   - Client ID: `458461432563-pkncm66du9pipuihdrbrhfrsuggo7loh.apps.googleusercontent.com`
   - Client Secret: (You'll need to copy this - looks like `GOCSPX-xxxxxxxxxxxxx`)

7. **Click** "Save"

### Step 2: Add Vercel Environment Variables

1. **Go to** [Vercel Dashboard](https://vercel.com/dashboard)
2. **Select** farritech project
3. **Click** "Settings" → "Environment Variables"
4. **Add these variables:**

   ```
   GOOGLE_CLIENT_ID = 458461432563-pkncm66du9pipuihdrbrhfrsuggo7loh.apps.googleusercontent.com
   
   GOOGLE_CLIENT_SECRET = [Your Client Secret from Google Cloud]
   
   GOOGLE_REDIRECT_URI = https://farritech.vercel.app/oauth-callback
   ```

5. **Check all boxes:** ☑ Production ☑ Preview ☑ Development
6. **Click** "Save" for each

### Step 3: Upload Files to GitHub

Your repo structure should be:
```
farritech/
├── index.html (updated)
├── oauth-callback.html (NEW)
└── api/
    └── google-calendar-auth.js (NEW)
```

**Upload:**
1. Replace `index.html` with new version
2. Create `oauth-callback.html` in root
3. Create `api/google-calendar-auth.js` in api folder
4. Commit and push

### Step 4: Deploy

Vercel will auto-deploy. Wait 1-2 minutes.

---

## How It Works

### OAuth Flow:

1. **User clicks "Connect Google Calendar"**
2. **Opens popup** to Google authorization page
3. **User authorizes**
4. **Google redirects** to `/oauth-callback`
5. **Callback extracts** authorization code
6. **Backend exchanges** code for tokens:
   - Access token (expires in 1 hour)
   - **Refresh token** (never expires!)
7. **Tokens saved** to Firestore
8. **User stays connected** ✅

### Auto-Refresh:

**Before each calendar operation:**
```javascript
// Check if token expires within 5 minutes
if (tokenExpiry - now < 5 minutes) {
  // Use refresh token to get new access token
  newAccessToken = await refresh(refreshToken);
  // Update Firestore
  // Continue with calendar operation
}
```

**Result:** Seamless, no user action required!

---

## Testing

### Step 1: Disconnect Current Connection

1. Go to "My QR Code" tab
2. Click "🔌 Disconnect"

### Step 2: Connect with New Flow

1. Click "Connect Google Calendar"
2. **New behavior:** Opens popup (not inline)
3. Authorize in popup
4. Popup closes automatically
5. See: "✅ Google Calendar connected successfully! You will stay connected automatically."

### Step 3: Check Firestore

Your farrier document should now have:
```json
{
  "googleCalendarConnected": true,
  "googleAccessToken": "ya29.a0...",
  "googleRefreshToken": "1//0g...",
  "googleTokenExpiry": 1706123456789
}
```

### Step 4: Test Auto-Refresh

1. **Wait 1 hour** (or manually expire the token in Firestore)
2. **Confirm an appointment**
3. **Check console:** Should see "🔄 Token expired or expiring soon, refreshing..."
4. **Event created** successfully! ✅
5. **No need to reconnect!** ✅

---

## Security Notes

### Refresh Token Storage

**Current:** Stored in Firestore (plaintext)

**Production Recommendation:** Encrypt refresh tokens before storing:
```javascript
// Use Firebase Functions to encrypt
const encrypted = encrypt(refreshToken, secretKey);
await db.collection('farriers').doc(uid).update({
  googleRefreshToken: encrypted
});
```

### Token Expiry

- Access tokens: 1 hour
- Refresh tokens: Never expire (until revoked)
- Auto-refresh: 5 minutes before expiry

---

## Troubleshooting

### Error: "redirect_uri_mismatch"
**Fix:** Add exact redirect URI to Google Cloud Console:
```
https://farritech.vercel.app/oauth-callback
```

### Error: "Invalid client secret"
**Fix:** Check `GOOGLE_CLIENT_SECRET` in Vercel environment variables

### Error: "Failed to refresh token"
**Causes:**
1. Refresh token revoked by user
2. Client secret changed
3. Permissions changed

**Fix:** Disconnect → Reconnect to get new refresh token

### Popup blocked
**Fix:** Allow popups for your site in browser settings

### Tokens not refreshing
**Check:**
1. Vercel function deployed: `/api/google-calendar-auth`
2. Environment variables set correctly
3. Console logs show refresh attempts

---

## API Endpoints

### Exchange Code for Tokens
```
POST /api/google-calendar-auth?action=exchange
Body: { code, redirect_uri }
Response: { access_token, refresh_token, expires_in }
```

### Refresh Access Token
```
POST /api/google-calendar-auth?action=refresh
Body: { refresh_token }
Response: { access_token, expires_in }
```

---

## Benefits

✅ **Never reconnect** - Stay connected forever
✅ **Seamless UX** - Auto-refresh in background
✅ **Professional** - Industry-standard OAuth flow
✅ **Reliable** - No more 401 errors
✅ **Scalable** - Works for 1000s of users

---

## Rollback Plan

If something goes wrong:

1. **Revert index.html** to old version
2. **Remove** oauth-callback.html
3. **Remove** api/google-calendar-auth.js
4. **Users reconnect** with old flow

---

## Next Steps (Optional)

1. **Encrypt refresh tokens** for production
2. **Add token revocation** when disconnecting
3. **Monitor token usage** in analytics
4. **Set up alerts** for refresh failures

---

## Summary

**Setup time:** 10 minutes
**Result:** Permanent Google Calendar connection!

**Before:** Reconnect every hour 😞
**After:** Set it and forget it! 🎉

Users will love never having to reconnect again!
