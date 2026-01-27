# Authorize.Net Payment Integration - Setup Guide

## 🎉 What's Included

Complete payment processing integration for Farrier Pro:
- ✅ **Secure credit card processing**
- ✅ **"Pay Now" button on invoices**
- ✅ **PCI compliant payment form**
- ✅ **Automatic invoice status updates**
- ✅ **Transaction logging**
- ✅ **Email receipts** (handled by Authorize.Net)
- ✅ **Sandbox testing** (test before going live)

---

## 📦 Files Included

```
├── index.html (UPDATED - payment form added)
├── api/
│   └── authorize-net-payment.js (NEW - payment processing)
└── AUTHORIZENET-SETUP.md (this file)
```

---

## 🔧 Setup Instructions

### Step 1: Add Environment Variables to Vercel

1. **Go to** [Vercel Dashboard](https://vercel.com/dashboard)
2. **Select** your project: `farrier-pro`
3. **Click** Settings → Environment Variables
4. **Add these 3 variables:**

```
AUTHORIZENET_API_LOGIN_ID = 4gAbez4C899J

AUTHORIZENET_TRANSACTION_KEY = 2wy478c54HAju2GJ

AUTHORIZENET_SANDBOX = true
```

5. **Check boxes:** ☑ Production ☑ Preview ☑ Development
6. **Click "Save"** for each variable

---

### Step 2: Upload Files to GitHub

1. **Replace** `index.html` with updated version
2. **Create** `api/authorize-net-payment.js` in your api folder
3. **Commit** and push changes

**Your repo structure:**
```
farrier-pro/
├── index.html (UPDATED)
├── landing.html
├── oauth-callback.html
└── api/
    ├── google-calendar-auth.js
    └── authorize-net-payment.js (NEW)
```

---

### Step 3: Wait for Deployment

Vercel will auto-deploy in 1-2 minutes.

---

### Step 4: Test with Sandbox

Use these **test credit cards** (sandbox mode):

**Visa (Approved):**
- Card: `4111 1111 1111 1111`
- Expiry: Any future date (e.g., 12/2026)
- CVV: Any 3 digits (e.g., 123)

**Mastercard (Approved):**
- Card: `5424 0000 0000 0015`
- Expiry: Any future date
- CVV: Any 3 digits

**Amex (Approved):**
- Card: `3782 822463 10005`
- Expiry: Any future date
- CVV: Any 4 digits

**Declined Card (for testing):**
- Card: `4000 0000 0000 0002`
- Will return "declined" error

---

## 🧪 Testing Workflow

### Test Payment Flow:

1. **Login** to your Farrier Pro account
2. **Go to** Invoices tab
3. **Create** a test invoice
   - Customer: Test Customer
   - Amount: $10.00
   - Status: Outstanding
4. **Click** "💳 Pay Now" button
5. **Enter** test card: `4111 1111 1111 1111`
6. **Expiry:** 12/2026
7. **CVV:** 123
8. **Click** "Pay $10.00"
9. **Success!** ✅ Invoice should update to "PAID"

### Verify in Authorize.Net:

1. **Login** to [sandbox.authorize.net](https://sandbox.authorize.net)
2. **Username:** Your Authorize.Net account email
3. **Go to** "Search" → "Unsettled Transactions"
4. **See** your test payment listed!

---

## 🚀 Going Live (Production)

Once testing is complete:

### Step 1: Get Production Credentials

1. **Login** to [authorize.net](https://account.authorize.net)
2. **Go to** Account → API Credentials & Keys
3. **Copy** your PRODUCTION credentials:
   - API Login ID
   - Transaction Key

### Step 2: Update Vercel Environment Variables

1. **Go to** Vercel → Settings → Environment Variables
2. **Update** these values:

```
AUTHORIZENET_API_LOGIN_ID = [YOUR_PRODUCTION_LOGIN_ID]

AUTHORIZENET_TRANSACTION_KEY = [YOUR_PRODUCTION_KEY]

AUTHORIZENET_SANDBOX = false
```

3. **Save** and **Redeploy**

### Step 3: Process Real Payments!

Now customers can pay with real credit cards! 🎉

---

## 💰 Authorize.Net Fees

**Transaction Fees:**
- 2.9% + $0.30 per transaction
- Example: $150 invoice = $4.65 fee
- You keep: $145.35

**Monthly Fee:**
- $25/month gateway fee
- First month usually waived

**No Setup Fees**
**No Cancellation Fees**

---

## 🔒 Security Features

✅ **PCI Compliant** - Card data never touches your server
✅ **SSL Encrypted** - All data encrypted in transit
✅ **Fraud Detection** - Built-in Authorize.Net tools
✅ **3D Secure** - Optional for extra security
✅ **Transaction Logging** - Full audit trail

---

## 💳 How It Works

### Customer Experience:

1. Receives invoice email with "Pay Now" link
2. Clicks link → Opens secure payment form
3. Enters credit card details
4. Clicks "Pay" button
5. Payment processes (2-3 seconds)
6. Gets confirmation email from Authorize.Net
7. Invoice automatically marked "PAID"

### Farrier Experience:

1. Creates invoice in system
2. Sends to customer (email/SMS)
3. Gets notification when paid
4. Sees updated invoice status
5. Money deposited to bank account (1-2 business days)

---

## 📊 Payment Dashboard

**View in Authorize.Net:**
- Daily settlement reports
- Transaction history
- Refund processing
- Chargeback management
- Fraud detection alerts

**View in Farrier Pro:**
- Paid invoices
- Outstanding invoices
- Total collected
- Payment history per customer

---

## 🔄 Refund Processing

### To Issue a Refund:

**Option 1: Via Authorize.Net (Recommended)**
1. Login to Authorize.Net dashboard
2. Find transaction
3. Click "Refund"
4. Enter amount
5. Confirm

**Option 2: Via API (Future Feature)**
- Can add refund button in Farrier Pro
- Processes refund via API
- Updates invoice automatically

---

## 🐛 Troubleshooting

### "Payment failed" Error:

**Check:**
1. ✅ Environment variables set correctly in Vercel
2. ✅ Using test cards in sandbox mode
3. ✅ Card number entered correctly (no spaces in API)
4. ✅ Expiry date in future
5. ✅ CVV is 3-4 digits

### "API Error" or 404:

**Check:**
1. ✅ `/api/authorize-net-payment.js` file uploaded to GitHub
2. ✅ Vercel deployment completed successfully
3. ✅ Browser console for error messages
4. ✅ API endpoint exists: `https://farrier-pro.vercel.app/api/authorize-net-payment`

### Invoice Doesn't Update:

**Check:**
1. ✅ Payment was successful (check Authorize.Net)
2. ✅ Firestore update permissions
3. ✅ Browser console errors
4. ✅ Refresh the page

---

## 📞 Support

**Authorize.Net Support:**
- Phone: 1-877-447-3938
- Email: merchant@authorize.net
- Hours: 24/7

**Farrier Pro Support:**
- Phone: (954) 673-3041
- Email: support@farrierpro.com

---

## 🎯 Next Steps

### Enhanced Features (Future):

- [ ] **Recurring Payments** - Auto-charge for subscriptions
- [ ] **Payment Plans** - Split large invoices
- [ ] **Saved Cards** - Customer Card on File (CIM)
- [ ] **Apple Pay / Google Pay** - One-tap payments
- [ ] **ACH / Bank Transfers** - Lower fees
- [ ] **Invoice Templates** - Custom branding
- [ ] **Auto-Reminders** - Send before due date
- [ ] **Late Fees** - Automatic calculation
- [ ] **Payment Analytics** - Revenue trends

---

## 📈 Success Metrics

**Track These:**
- Payment success rate (target: >95%)
- Average time to payment (target: <3 days)
- Outstanding invoice aging
- Monthly collected revenue
- Failed payment reasons

---

## ✅ Checklist

**Before Going Live:**
- [ ] Sandbox testing completed
- [ ] Test cards work correctly
- [ ] Invoice updates after payment
- [ ] Production credentials obtained
- [ ] Environment variables updated
- [ ] Real card test successful
- [ ] Email receipts received
- [ ] Bank account verified in Authorize.Net

---

## 🎉 You're All Set!

Your Farrier Pro platform now has **professional payment processing**!

Customers can pay invoices instantly with credit cards, and you get paid faster with less hassle.

**Welcome to automated payments!** 💰🚀

---

## 📝 Credentials Summary

**Sandbox (Testing):**
```
API Login ID: 4gAbez4C899J
Transaction Key: 2wy478c54HAju2GJ
Key Name: Simon
Sandbox Mode: true
```

**Production:**
```
[Update with your production credentials when ready]
```

---

**Questions? Call (954) 673-3041** 📞
