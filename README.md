# Farrier Pro App (Cleaned)

## What changed
- Removed the `/api/auth/email-exists` pre-check during signup.
- Signup now relies on Firebase Auth errors (e.g. `auth/email-already-in-use`) and shows a friendly message.

## Deploy notes (Vercel)
### API Route
- `api/create-subscription.js` is a Vercel Serverless Function (POST only).

### Required env vars (Vercel → Project → Settings → Environment Variables)
- AUTHNET_API_LOGIN_ID
- AUTHNET_TRANSACTION_KEY
- AUTHNET_ENV = sandbox | production (optional, defaults to sandbox)
- TRIAL_DAYS = 14 (optional)

## Firebase
Firebase config is in `index.html` (client-side). Ensure your Firebase Auth providers are enabled.
