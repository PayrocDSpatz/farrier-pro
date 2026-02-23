# Customer Portal - Complete Setup Guide

## 🎉 What You're Getting

A **complete customer portal** where your customers can:
- ✅ Sign up / Login with email & password
- ✅ View all their invoices
- ✅ See payment history
- ✅ Pay invoices instantly with credit card
- ✅ Secure authentication via Firebase
- ✅ Beautiful, professional design

**All using FREE services you already have!**

---

## 📦 What's Included

```
customer-portal.html
- Login/Signup page
- Customer dashboard
- Invoice list view
- Payment processing
- Responsive design
- Firebase authentication
- Firestore database integration
```

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Upload to GitHub

1. **Upload** `customer-portal.html` to your repo
2. **Commit** changes

**Your repo structure:**
```
farritech/
├── index.html (farrier dashboard)
├── customer-portal.html (NEW - customer portal)
├── landing.html
├── oauth-callback.html
└── api/
    └── authorize-net-payment.js
```

### Step 2: Access the Portal

Once deployed, customers can access at:
```
https://farritech.vercel.app/customer-portal.html
```

### Step 3: Share with Customers

Send customers this link to:
- Sign up
- View invoices
- Pay online

---

## 👤 How It Works

### For Customers:

**First Time:**
1. **Go to** farritech.vercel.app/customer-portal.html
2. **Click** "Don't have an account? Sign up"
3. **Enter:**
   - Full Name
   - Phone Number
   - Email
   - Password
4. **Click** "Create Account"
5. **Logged in!** ✅

**Returning Customers:**
1. **Go to** farritech.vercel.app/customer-portal.html
2. **Enter** email & password
3. **Click** "Sign In"
4. **See invoices!** ✅

**Paying an Invoice:**
1. **See** list of invoices
2. **Outstanding invoices** have "💳 Pay Now" button
3. **Click** "Pay Now"
4. **Enter** credit card details
5. **Click** "Pay $XXX.XX"
6. **Done!** Invoice marked "PAID" ✅

### For Farriers (You):

**Creating Invoice:**
1. **Login** to farrier dashboard
2. **Go to** Invoices tab
3. **Create** invoice with customer email
4. **Customer automatically sees it** in their portal!

**Customer finds it by:**
- Email address matches invoice
- All invoices for that email show up

---

## 🔐 Security Features

✅ **Firebase Authentication** - Industry standard
✅ **Secure password storage** - Hashed & encrypted
✅ **Email verification** (optional - can enable)
✅ **Password reset** (optional - can enable)
✅ **PCI Compliant** - Cards processed by Authorize.Net
✅ **No card storage** - Cards never touch your server

---

## 📧 How Customers Find Their Invoices

### Automatic Matching:

When you create an invoice with customer email:
```
customerEmail: "john@example.com"
```

Customer signs up with same email:
```
signup email: "john@example.com"
```

**Portal automatically shows all their invoices!** ✅

### Important:

- Invoices matched by **email address**
- Customer must sign up with **same email** you used on invoice
- Case-insensitive matching

---

## 💳 Payment Flow

```
Customer Portal
    ↓
Clicks "Pay Now"
    ↓
Payment Modal Opens
    ↓
Enters Card Details
    ↓
Clicks "Pay $XXX.XX"
    ↓
Calls /api/authorize-net-payment
    ↓
Authorize.Net Processes
    ↓
Success!
    ↓
Invoice Status → "PAID"
    ↓
Email Receipt (Authorize.Net)
    ↓
Customer Sees Updated Status
```

---

## 🎨 Design Features

### Professional & Modern:
- ✅ **Custom fonts** - DM Sans & DM Serif Display
- ✅ **Branded colors** - Green theme for farrier/equestrian
- ✅ **Smooth animations** - Polished interactions
- ✅ **Mobile responsive** - Works on phones
- ✅ **Clean layouts** - Easy to use
- ✅ **Professional** - Builds trust

### Key Elements:
- Beautiful login page
- Dashboard with stats
- Elegant invoice cards
- Secure payment modal
- Empty states
- Loading indicators

---

## 🧪 Testing

### Test Customer Account:

1. **Go to** customer-portal.html
2. **Sign up** with test email: `test@customer.com`
3. **Create invoice** in farrier dashboard:
   - Customer Email: `test@customer.com`
   - Amount: $50.00
4. **Refresh** customer portal
5. **See invoice** appear!
6. **Click** "Pay Now"
7. **Use test card:** `4111 1111 1111 1111`
8. **Process payment**
9. **Invoice updates** to "PAID" ✅

---

## 📱 Sharing the Portal

### Give Customers This URL:

```
https://farritech.vercel.app/customer-portal.html
```

### Ways to Share:

**Text Message:**
```
Hi [Name]! You can view and pay your farrier 
invoices online at:
https://farritech.vercel.app/customer-portal.html

Sign up with this email: [their email]
```

**Email:**
```
Subject: View Your Farrier Invoices Online

Hi [Name],

You can now view and pay your invoices online!

Visit: https://farritech.vercel.app/customer-portal.html
Sign up with: [their email]

Thanks!
```

**QR Code on Business Card:**
- Generate QR code for portal URL
- Print on cards
- Customers scan → instant access

---

## 🔄 Customer Workflow Example

### Real-World Scenario:

**Day 1 - Service:**
1. You shoe John's horses
2. You create invoice: $150
3. Customer email: john@horselover.com

**Day 1 - Invoice Created:**
1. Invoice saved to Firestore
2. Status: "outstanding"

**Day 2 - Customer Gets Link:**
1. You text John: "View invoice at [portal link]"
2. John clicks link
3. Signs up with john@horselover.com
4. **Immediately sees his $150 invoice**

**Day 2 - Payment:**
1. John clicks "Pay Now"
2. Enters credit card
3. Pays $150
4. Gets email receipt from Authorize.Net
5. Invoice updates to "PAID"

**Day 3 - History:**
1. John logs back in
2. Sees "Total Paid: $150.00"
3. Can view receipt anytime
4. Professional experience!

---

## ⚡ Advanced Features (Optional)

### Email Notifications:

**Add SendGrid (FREE tier):**
- Email when invoice created
- Email when payment successful
- Email receipt link

**Setup:** 15 minutes
**Cost:** $0 (free tier)

### Password Reset:

**Enable in Firebase:**
- Forgot password link
- Reset via email
- Easy 5-minute setup

### Email Verification:

**Enable in Firebase:**
- Verify email on signup
- Prevents fake accounts
- Optional security

---

## 📊 Customer Database Structure

### Firestore Collections:

**customers/**
```json
{
  "userId": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "(555) 555-5555",
    "createdAt": "timestamp"
  }
}
```

**invoices/**
```json
{
  "invoiceId": {
    "farrierId": "farrier-uid",
    "customerEmail": "john@example.com",
    "customerName": "John Smith",
    "total": 150.00,
    "status": "paid",
    "createdAt": "timestamp",
    "paidAt": "timestamp",
    "transactionId": "auth-net-id"
  }
}
```

---

## 🎯 Benefits

### For Customers:
- ✅ Pay anytime, anywhere
- ✅ View invoice history
- ✅ No need to write checks
- ✅ Instant receipts
- ✅ Professional experience

### For You (Farrier):
- ✅ Get paid faster
- ✅ Less manual work
- ✅ No handling card details
- ✅ Professional image
- ✅ Automatic tracking
- ✅ Better cash flow

---

## 🔧 Customization

### Easy Changes:

**Colors:**
```css
:root {
  --primary: #2c5f2d;  /* Your brand green */
  --accent: #97c05c;   /* Lighter green */
}
```

**Logo:**
- Replace 🐴 emoji with your logo image
- Update company name

**Welcome Text:**
- Edit auth page headers
- Change dashboard titles

---

## 🆘 Troubleshooting

### "Can't see my invoices":
**Check:**
- Signed up with correct email?
- Invoice has customerEmail field?
- Email addresses match exactly?

### "Payment not working":
**Check:**
- Environment variables set in Vercel?
- api/authorize-net-payment.js deployed?
- Using test card in sandbox mode?

### "Can't sign up":
**Check:**
- Firebase initialized correctly?
- Internet connection working?
- Email not already registered?

---

## 📞 Support

**Questions?**
Call: (954) 673-3041

**Common Issues:**
See troubleshooting section above

---

## ✅ Checklist

**Setup:**
- [ ] Upload customer-portal.html to GitHub
- [ ] Verify deployment on Vercel
- [ ] Test signup with fake email
- [ ] Create test invoice
- [ ] Test payment with test card
- [ ] Verify invoice updates to "PAID"

**Go Live:**
- [ ] Share portal URL with customers
- [ ] Add link to business cards
- [ ] Include in email signature
- [ ] Post on social media
- [ ] Tell existing customers

---

## 🎊 Congratulations!

You now have a **complete customer portal** with:
- ✅ Authentication
- ✅ Invoice viewing
- ✅ Payment processing
- ✅ Professional design
- ✅ Mobile responsive
- ✅ Secure & PCI compliant

**All for $0/month!** (except Authorize.Net fees you're already paying)

Your customers can now self-serve and pay online anytime! 🚀

---

**Portal URL:** `https://farritech.vercel.app/customer-portal.html`

**Share this link with your customers today!** 💰🐴
