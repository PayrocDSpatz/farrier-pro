# Quick Start Guide - Get Running in 15 Minutes

## 🚀 Fastest Path to Deployment

### Step 1: Deploy to Netlify (2 minutes)
1. Go to https://app.netlify.com/drop
2. Drag and drop the `farrier-pro` folder
3. **Copy your live URL** (e.g., `https://your-site-123.netlify.app`)

### Step 2: Firebase Setup (5 minutes)
1. Go to https://console.firebase.google.com/
2. Create new project → Name it "farrier-pro"
3. Click **Authentication** → Get started → Enable Email/Password
4. Click **Firestore Database** → Create database → Test mode
5. Click ⚙️ → Project settings → Scroll to "Your apps"
6. Click `</>` → Register app → Copy the config
7. Download your `index.html` from Netlify
8. Replace the firebaseConfig section with your copied config
9. Re-upload to Netlify

### Step 3: Google Calendar (5 minutes)
1. Go to https://console.cloud.google.com/
2. Create project or select existing
3. Enable **Google Calendar API**
4. Create credentials → OAuth client ID → Web application
5. Add your Netlify URL to authorized JavaScript origins
6. Copy Client ID
7. Update `index.html` with your Client ID
8. Re-upload to Netlify

### Step 4: Test It! (3 minutes)
1. Open your Netlify URL
2. Click "Sign Up"
3. Create a farrier account
4. Go to "My QR Code" tab
5. Download your QR code
6. Test the booking flow by opening: `your-url?farrier=YOUR_USER_ID`

## ✅ You're Live!

**What works now:**
- ✅ Farrier sign up / login
- ✅ Unique QR codes for each farrier
- ✅ Customer booking pages
- ✅ Google Calendar connection
- ✅ Dashboard and KPIs

**What needs backend for production:**
- ⏳ Actual Stripe payment processing (currently simulated)
- ⏳ Real SMS sending (currently simulated)
- ⏳ Automatic calendar event creation

See `SETUP-GUIDE.md` for full production setup with backend functions.

## 📱 Share Your QR Code

1. Download QR code from dashboard
2. Print on sticker or magnetic sign
3. Put on your vehicle
4. Customers scan → Book instantly!

## 🆘 Need Help?

Common issues and fixes in `SETUP-GUIDE.md` → Troubleshooting section.
