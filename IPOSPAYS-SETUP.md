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
- **Refunds:** the Refund button on an invoice paid through iPOSpays (manager password required)
  voids it if the batch hasn't settled, otherwise refunds it, via iPOS Transact
  (`POST payment.ipospays.{tech,com}/api/v3/iposTransact`, transactionType 2 or 3, by the
  payment's RRN). Partial amounts are always refunds. Refunds done in the iPOSpays portal
  aren't seen by FarriTech.
- **One processor at a time:** a farrier connects Stripe or iPOSpays, not both. Connecting one
  is refused while the other is connected, and disconnecting either first closes its open
  payment pages (recording any a customer has just paid).
- **Keyed cards:** with iPOSpays, Charge Card (desktop) and Card (mobile) open the invoice's
  iPOSpays payment page for the farrier to key the card in. It charges the whole balance at the
  pay-link price; the card details never pass through FarriTech.
- **Still Stripe only:** the customer portal's card payments.

Disconnecting iPOSpays sends pay links back to Stripe. It first closes every iPOSpays payment
page still on offer (recording any a customer has just paid), because a page paid after the keys
are gone could never be confirmed or refunded from FarriTech. If iPOSpays can't be reached to
close one, iPOSpays stays connected and the farrier is asked to try again.

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

Sandbox test cards and the amounts that trigger declines are in
[IPOSPAYS-SANDBOX-CARDS.md](IPOSPAYS-SANDBOX-CARDS.md).

## What the first sandbox test showed (2026-10-08)

A $1.03 test payment on sandbox TPN 950126444275 went through end to end and marked the invoice
paid. iPOSpays behaves differently from its docs in a few ways, and the code handles each:

1. **Token request.** Only `apiKey`, `secretKey` and `TokenExpiryMinutes` headers, with no `scope`
   (confirmed by Dejavoo support). With a scope, payment pages fail with "User is not registered
   for PaymentTokenization".
2. **Query Payment Status answer.** It's `{ status, data: { responseCode, transactionReferenceId,
   totalAmount, ... } }` (`{ status: "Pending", data: {} }` until it settles), not
   `{ iposHPResponse }`. Amounts are in cents (`"103"` = $1.03).
3. **Return URL.** iPOSpays appends its own `?responseCode=…` to our return URL, so only the
   leading reference id of `ipos_ref` is used.
4. **One try per page.** A page expires after one attempt, declined or not, so a retry gets a
   new page. Opening `/pay/{invoiceId}` checks the recent pages with iPOSpays before offering one.
5. **Callback.** It arrives before the payment settles (status Pending), so the customer's
   return to `/pay/{invoiceId}` is what usually records the payment.

On a Vercel preview, pay links point at the preview's branch URL so the whole flow can be
tested there.

Before going live, email devsupport@denovosystem.com for production credentials, as the
iPOSpays docs require.
