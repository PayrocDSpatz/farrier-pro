# iPOSpays Pay Links — Setup Guide

FarriTech can take pay-link payments through a farrier's own iPOSpays (Dejavoo) merchant
account instead of Stripe, using the iPOSpays **Hosted Payment Page** (HPP).

## What changes when a farrier connects iPOSpays

- The pay link customers get (`https://app.farritech.com/pay/{invoiceId}`) opens an iPOSpays
  payment page instead of Stripe Checkout. Links already sent keep working.
- The amount is FarriTech's own price (card price unless waived). iPOSpays is told not to add
  fees, tax or tips (`calculateFee`, `calculateTax`, `tipsInputPrompt` all false).
- Invoices are marked paid automatically, and the customer gets the usual "payment received" text.
- Recording a cash/check/Zelle/etc. payment, or waiving the card price, cancels the open
  iPOSpays page so the customer can't pay twice.
- **Still Stripe only:** keyed card payments, refunds, and the customer portal. Refund
  iPOSpays payments in the iPOSpays portal.

Disconnecting iPOSpays sends pay links back to Stripe.

## What the farrier needs (iPOSpays portal, Merchant Admin login)

| Field in FarriTech | Where to find it |
|---|---|
| Environment | Sandbox for testing, Production for real payments |
| TPN | The 12-digit CloudPOS TPN of the merchant account |
| API Key / Secret Key | Settings → Generate API & Secret Key |
| Ecom Token | Settings → Merchant Keys / Ecom Token → pick the TPN → Generate Token |

Enter them in **Settings → iPOSpays Payments** (desktop or mobile) and click **Validate & Save**.
FarriTech checks the keys with iPOSpays before saving, then stores everything in the locked
`farrierSecrets/{uid}` document. Keys are never sent back to the browser.

## How it works

| Step | iPOSpays API |
|---|---|
| Get an auth token (24 h, cached, refreshed automatically) | `POST auth.ipospays.{tech,com}/v1/authenticate-token` (headers `apiKey`, `secretKey`, `TokenExpiryMinutes` only) |
| Make the payment page | `POST payment.ipospays.{tech,com}/api/v3/external-payment-transaction` |
| Confirm a payment | `GET api.ipospays.{tech,com}/v1/queryPaymentStatus` (Ecom token) |
| Close a page | `POST payment.ipospays.{tech,com}/api/v1/cancel` |

iPOSpays reports payments to `/api/ipospays/callback/{invoiceId}` (server to server) and sends
the customer back to `/pay/{invoiceId}?ipos_ref=…`. Neither is trusted on its own: each one
just triggers Query Payment Status, and only an approved status is recorded. Code:
`api/_lib/ipospays.js`. It runs inside `api/stripe-payment.js`, because Vercel Hobby allows
only 12 functions.

`.tech` hosts = sandbox, `.com` hosts = production, chosen per farrier by the Environment setting.

## Things to confirm on the first sandbox test

The iPOSpays docs leave a few details open. Check each of these on the first test payment:

1. **Token request headers.** Dejavoo support confirmed the token request sends only
   `apiKey`, `secretKey` and `TokenExpiryMinutes`, with no `scope` header, and tested the
   Hosted Payment Page end to end on sandbox TPN 950126444275.
2. **Both notifications in one request.** FarriTech sends `notifyByPOST` (callback) and
   `notifyByRedirect` (customer return) together. If the payment page request is rejected
   for that, keep one of them.
3. **Ecom token check.** When connecting, a lookup of a made-up payment should be refused
   (401/403) only when the token is wrong.

Before going live, email devsupport@denovosystem.com for production credentials, as the
iPOSpays docs require.
