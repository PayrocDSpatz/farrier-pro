# 🐴 Farrier Pro - Multi-User Business Management Platform

A complete business management solution for farriers with customer booking, Google Calendar sync, Stripe payments, and unique QR codes for each farrier.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## ✨ Features

### For Farriers
- 🔐 **Individual Accounts** - Secure login for each farrier
- 📱 **Unique QR Codes** - Generate QR codes for vehicles and business cards
- 📅 **Google Calendar Sync** - Automatic two-way calendar integration
- 💰 **Stripe Payments** - Generate payment links for invoices
- 📊 **Business Analytics** - Track appointments, revenue, and KPIs
- 📲 **SMS Notifications** - Send reminders and confirmations
- 📱 **Mobile-First Design** - Fully responsive for on-the-go management

### For Customers
- 📷 **QR Code Booking** - Scan and book instantly
- 📅 **Real-Time Availability** - See available time slots
- ✉️ **Automatic Confirmations** - Get SMS/email updates
- 💳 **Easy Payments** - Pay invoices via Stripe links

## 🚀 Quick Start

### Option 1: Deploy to Netlify (Fastest)
1. Download this repository
2. Go to [Netlify Drop](https://app.netlify.com/drop)
3. Drag and drop the entire folder
4. Follow setup instructions in `QUICK-START.md`

### Option 2: Deploy to GitHub Pages
1. Fork this repository
2. Enable GitHub Pages in Settings
3. Follow setup instructions in `QUICK-START.md`

### Option 3: Deploy to Vercel
1. Import this repository to Vercel
2. Deploy with one click
3. Follow setup instructions in `QUICK-START.md`

## 📚 Documentation

- **[QUICK-START.md](QUICK-START.md)** - Get running in 15 minutes
- **[SETUP-GUIDE.md](SETUP-GUIDE.md)** - Complete setup with Firebase, Google Calendar, and Stripe

## 🛠️ Tech Stack

- **Frontend**: React (via CDN), HTML5, CSS3
- **Authentication**: Firebase Auth
- **Database**: Cloud Firestore
- **Calendar**: Google Calendar API
- **Payments**: Stripe
- **QR Codes**: qrcode.js
- **SMS**: Twilio (backend required)

## 📋 Requirements

### Free Services:
- Firebase account (authentication & database)
- Google Cloud account (Calendar API)
- Stripe account (payment processing)

### For Production (Optional):
- Twilio account (SMS notifications)
- Netlify/Vercel account (serverless functions)

## 🔧 Configuration

### 1. Firebase Setup
Replace Firebase config in `index.html` (line ~843):
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ... etc
};
```

### 2. Google Calendar API
Replace Client ID in `index.html` (line ~859):
```javascript
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";
```

### 3. Stripe
Replace publishable key in `index.html`:
```javascript
const stripe = window.Stripe('pk_test_YOUR_PUBLISHABLE_KEY');
```

## 📱 How It Works

### Farrier Workflow:
1. Sign up with email/password
2. Connect Google Calendar (one click)
3. Download unique QR code
4. Print QR code on vehicle/business cards
5. Receive bookings automatically
6. Manage appointments in dashboard
7. Send invoices with Stripe payment links

### Customer Workflow:
1. Scan QR code on farrier's vehicle
2. Opens booking page for that specific farrier
3. Select service, date, and time
4. Submit appointment request
5. Receive SMS confirmation
6. Get reminders before appointment
7. Pay invoice via Stripe link

## 📊 Database Structure

### Collections:
- **farriers** - User profiles and settings
- **appointments** - Customer bookings
- **invoices** - Payment records

See `SETUP-GUIDE.md` for detailed schema.

## 🔒 Security

- Authentication via Firebase Auth
- Firestore security rules (see Setup Guide)
- No API keys in frontend (for production)
- HTTPS required for OAuth flows
- Environment variables for secrets

## 🌐 Browser Support

- Chrome (recommended)
- Safari
- Firefox
- Edge
- Mobile browsers (iOS/Android)

## 📸 Screenshots

### Farrier Dashboard
- QR code generation and download
- Appointment calendar
- Business KPIs and analytics
- Invoice management

### Customer Booking
- Mobile-friendly booking form
- Real-time availability
- Service selection
- Confirmation screen

## 🚧 Roadmap

- [ ] Mobile app (React Native)
- [ ] Multi-language support
- [ ] Advanced reporting
- [ ] Recurring appointments
- [ ] Customer portal
- [ ] Email marketing integration
- [ ] Expense tracking
- [ ] Team management (multiple farriers per business)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 💡 Support

For setup help, see:
- `QUICK-START.md` for fast deployment
- `SETUP-GUIDE.md` for detailed instructions
- Open an issue for bugs or questions

## 🙏 Acknowledgments

- Built with React, Firebase, and modern web technologies
- QR code generation by qrcode.js
- Icons and fonts from Google Fonts
- Created with Claude AI

---

**Ready to transform your farrier business?** Get started with the Quick Start guide!
