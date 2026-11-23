# UltraPay

UltraPay is a payment gateway API built with Express and MySQL.

## Endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/admin/login`
- `POST /api/admin/merchants`
- `GET /api/admin/merchants`
- `GET /api/admin/merchants/:merchantId`
- `PATCH /api/admin/merchants/:merchantId`
- `PATCH /api/admin/merchants/:merchantId/details`
- `PATCH /api/admin/merchants/:merchantId/status`
- `POST /api/admin/merchants/:merchantId/token/reset`
- `GET /api/admin/merchants/:merchantId/ledger`
- `POST /api/admin/merchants/:merchantId/ledger`
- `GET /api/admin/tickets`
- `GET /api/admin/tickets/stats`
- `GET /api/admin/tickets/:ticketId`
- `POST /api/admin/tickets/:ticketId/messages`
- `PATCH /api/admin/tickets/:ticketId/status`
- `GET /api/admin/gateways`
- `POST /api/admin/gateways`
- `GET /api/admin/gateways/:gatewayId`
- `PATCH /api/admin/gateways/:gatewayId`
- `PATCH /api/admin/gateways/:gatewayId/status`
- `GET /api/admin/payin/stats`
- `GET /api/admin/payin/transactions`
- `GET /api/admin/payin/transactions/:id`
- `GET /api/admin/payin/export.csv`
- `POST /api/payin/request`
- `GET /api/payin/request`
- `GET /api/payin/request/:id`
- `GET /api/admin/payout/stats`
- `GET /api/admin/payout/transactions`
- `GET /api/admin/payout/transactions/:id`
- `PATCH /api/admin/payout/transactions/:id/status`
- `GET /api/admin/payout/export.csv`
- `GET /api/tickets`
- `POST /api/tickets`
- `GET /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/messages`
- `GET /api/payments`
- `POST /api/payments`
- `GET /api/payments/:id`
- `PATCH /api/payments/:id/status`
- `POST /api/payouts`
- `GET /api/payouts`
- `GET /api/payouts/:id`

Payin, payment, and payout endpoints accept a merchant JWT or the generated
`X-Merchant-Id` and `X-Merchant-Token` headers. Payout requests require payout
to be enabled for the merchant. Admin payout endpoints require an admin JWT.
Payout creation records a pending request; it does not initiate a bank transfer.
Admin login returns an admin-role JWT and never includes the password hash in its response.
Merchant management endpoints require an admin JWT.

## Payin requests

Create a payin request with `POST /api/payin/request`. It requires merchant
authentication and payin to be enabled. The request creates a pending
transaction record. Selecting an enabled `TRUSTPAY24` gateway account also
creates a payin with TrustPay24 and includes its response in `gatewayResponse`.
Other gateway accounts continue to create local pending records only.

```http
POST /api/payin/request
Authorization: Bearer <merchant-token>
Content-Type: application/json

{
  "reference": "PAY-10001",
  "orderId": "ORDER-10001",
  "amount": 2500.00,
  "currency": "INR",
  "gatewayAccountId": 1,
  "method": "UPI",
  "payer": { "name": "Asha Kumar", "phone": "9876543210" },
  "returnUrl": "https://shop.example/orders/10001",
  "expiresInSec": 900,
  "narration": "Order 10001"
}
```

For TrustPay24, create an enabled gateway account with code `TRUSTPAY24`,
direction `payin` (or `both`), and payment method `UPI`. Configure
`TRUSTPAY24_API_KEY` and `TRUSTPAY24_API_SECRET` in the backend process
environment (or its local, untracked `.env` file); do not commit the values.
These environment variables are shared by all TrustPay24 gateway accounts.
TrustPay24 credentials are not stored in the gateway account.

```json
{
  "providerName": "TrustPay24",
  "code": "TRUSTPAY24",
  "direction": "payin",
  "paymentMethods": ["UPI"],
  "chargePercent": 0,
  "status": "enabled"
}
```

Send this to `POST /api/admin/gateways` as an admin. The
payin request must use INR, include payer details, and use an HTTPS `returnUrl`.
The response contains the created payment record, its `pending` status, and the
provider's `gatewayResponse` (including any checkout URL returned by the
provider).
Use `GET /api/payin/request/:id` to check the status. References must be
unique; amounts must be positive with at most two decimal places. If supplied,
the gateway account must be enabled and configured for payin.
List the merchant's payin requests with `GET /api/payin/request`; results are
newest first. Merchant payout requests are listed with `GET /api/payouts`.

## API rate limits

All endpoints, including `/health`, share a limit of 120 requests per IP
address per 15-minute window. Merchant and admin login endpoints have an
additional shared limit of 10 attempts per IP per 15 minutes. Merchant
registration is limited to 5 requests per IP per hour. CORS `OPTIONS`
preflight requests are excluded.
Requests over a limit receive HTTP `429` with a JSON error and standard
`RateLimit-*` headers.

Express trusts loopback proxies by default. If the reverse proxy that forwards
requests to this app uses another address, set `TRUSTED_PROXY_IPS` to its
comma-separated IP addresses or CIDRs (for example, `127.0.0.1` or
`10.0.0.5,10.0.1.0/24`). Only list proxies controlled by your deployment;
trusting arbitrary forwarded headers can let clients spoof their IP and evade
rate limits.

The default limiter store is in memory for this Node.js process; counters reset
when the process restarts and are not shared across multiple server instances.
Use a shared rate-limit store for multi-instance production deployments.

## Merchant authentication

Merchant sign-in is available at `POST /api/auth/login`. It accepts the email
and password assigned when the merchant account is created:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "merchant@example.com",
  "password": "<merchant-password>"
}
```

On success, the response contains a seven-day merchant-role bearer token and a
safe merchant profile (never a password hash):

```json
{
  "token": "<merchant-jwt>",
  "tokenType": "Bearer",
  "expiresIn": "7d",
  "merchant": {
    "id": 123,
    "merchantId": "MRC_0123456789ABCDEF01234567",
    "name": "Example Merchant",
    "email": "merchant@example.com",
    "mobile": "+919999999999",
    "status": "active",
    "payinEnabled": true,
    "payoutEnabled": true
  }
}
```

Use the token on merchant-authenticated APIs as
`Authorization: Bearer <merchant-jwt>`. `GET /api/auth/me` validates the
current merchant token and returns the signed-in merchant profile. Admin
tokens are rejected by merchant-authenticated APIs. Merchant JWTs are issued
only for active merchant accounts; invalid credentials and inactive accounts
receive the same `401 Invalid credentials` response.

## Setup

```bash
npm install
npm run dev
```

The server automatically applies pending database migrations before listening.
`npm run migrate` is also available to apply migrations manually.

Create the first admin after running migrations. Set `ADMIN_NAME`, `ADMIN_EMAIL`,
and `ADMIN_PASSWORD` in the environment (use a password of at least 12 characters),
then run:

```bash
npm run admin:create
```

Sign in with `POST /api/admin/login` and JSON containing `email` and `password`.

### Local test admin

For local development only, create a test admin after starting the app once
(which applies migrations):

```powershell
$env:NODE_ENV = "development"
npm run admin:seed:test
```

Test login:

- Email: `admin@test.ultrapay.local`
- Password: `UltraPay-Test-Admin-2026!`

Then send a `POST` request to `/api/admin/login` with those credentials. Do not
use this test account or password in production.

Configure `.env` before starting the server:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=ultrapay
JWT_SECRET=replace-with-a-long-random-secret
MERCHANT_DATA_KEY=replace-with-64-hex-characters
```

Generate `MERCHANT_DATA_KEY` with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Keep this key secret and stable: changing it makes previously encrypted bank
account, Aadhaar, and PAN values unreadable.

## Merchant management

Log in as an admin, then send the resulting token as
`Authorization: Bearer <admin-token>`.

Create a merchant with `POST /api/admin/merchants`:

```json
{
  "name": "Example Merchant",
  "mobile": "+919999999999",
  "email": "merchant@example.com",
  "password": "Choose-A-Strong-Password",
  "companyName": "Example Company",
  "bankName": "Example Bank",
  "ifsc": "ABCD0123456",
  "accountNumber": "123456789012",
  "aadhaarCard": "123412341234",
  "panCard": "ABCDE1234F",
  "gstin": "22AAAAA0000A1Z5",
  "payinEnabled": true,
  "payoutEnabled": true,
  "status": "active",
  "payinCommission": 0.5,
  "payoutCommission": 0.5,
  "directFundCommissionEnabled": true
}
```

The `password` field is optional and must be at least 12 characters and no
more than 72 UTF-8 bytes. If supplied, it is stored as a bcrypt hash and is
never returned by the API. If omitted, the API generates a temporary password
and returns it once in the create response; securely share it with the
merchant. In both cases the API generates the merchant ID and API token. The
token is returned only in the create response, stored as a hash, and can be
used on payment requests with `X-Merchant-Id` and `X-Merchant-Token` headers.

`GET /api/admin/merchants` lists merchants without bank or identity numbers.
The list supports pagination and filters: `page` (default `1`), `limit` (default
`20`, maximum `100`), `search` (matches merchant ID, name, email, mobile, and
company name), `status` (`active`, `inactive`, or `suspended`),
`payinEnabled` (`true` or `false`), and `payoutEnabled` (`true` or `false`).
For example:

```http
GET /api/admin/merchants?search=example&status=active&payinEnabled=true&page=2&limit=10
```

The response contains the merchant records, pagination totals/page flags, and
the applied filters:

```json
{
  "merchants": [],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "filters": {
    "search": "example",
    "status": "active",
    "payinEnabled": true,
    "payoutEnabled": null
  }
}
```

`GET /api/admin/merchants/:merchantId` returns full details to an admin; bank
account, Aadhaar, and PAN are encrypted in MySQL and require the data key above.
The detail response also includes the masked API token, wallet balance, total
commission, and timestamps. Use `PATCH /api/admin/merchants/:merchantId` to
update profile/configuration fields, `PATCH /status` with `{"status":"suspended"}`
to suspend or `{"status":"active"}` to reactivate, and
`POST /token/reset` to replace the API token. A reset returns the new token once.

Edit only the merchant's business, bank, and tax information with
`PATCH /api/admin/merchants/:merchantId/details`. Send only the fields to
change; supported fields are `mobile`, `companyName`, `bankName`, `ifsc`,
`accountNumber`, `aadhaarCard`, `panCard`, and `gstin`. For example:

```http
PATCH /api/admin/merchants/MRC_0123456789ABCDEF01234567/details
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "companyName": "Updated Example Company",
  "bankName": "Example Bank",
  "ifsc": "ABCD0123456",
  "accountNumber": "123456789012"
}
```

The endpoint returns the updated merchant record. Bank and identity values are
encrypted at rest and are returned in the admin response. Unsupported fields
(such as `status`, `name`, or payment settings) are rejected; use the general
merchant update or status endpoint for those fields.

Wallet data is calculated from the immutable `merchant_wallet_ledger`:
`credit` adds to the balance, `debit` subtracts, and `commission` adds to total
commission without changing the balance. For example, append a wallet credit
using `POST /api/admin/merchants/:merchantId/ledger`:

```json
{
  "type": "credit",
  "amount": 25000,
  "reference": "FUND-2026-001",
  "description": "Approved wallet funding"
}
```

Use `"type":"commission"`, `"amount":0`, and a positive `commissionAmount` to
record commission. Ledger references are unique per merchant and debit entries
cannot exceed the current wallet balance.
Merchant account information is stored in `merchants`; business, bank, tax,
commission, and API credential data is stored in the related
`merchant_details` table. The wallet ledger is a separate append-only financial
record. All three tables track dates in the Asia/Kolkata timezone; merchant
`updatedAt` values change automatically when their corresponding row is updated.

## Support tickets

Merchants use their merchant JWT or `X-Merchant-Id` and `X-Merchant-Token`
headers to create and view only their own tickets:

- `POST /api/tickets` creates a ticket.
- `GET /api/tickets?page=1&limit=20&status=open` lists the merchant's tickets.
- `GET /api/tickets/:ticketId` returns its details, merchant information,
  attachments, and conversation.
- `POST /api/tickets/:ticketId/messages` adds a merchant reply.

Ticket creation example:

```json
{
  "subject": "Payout not received",
  "category": "Payout Issue",
  "priority": "high",
  "description": "The payout is marked completed but has not reached the bank.",
  "message": "Please check this payout and let us know the status.",
  "attachments": [
    {
      "fileName": "payout-receipt.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 433152,
      "url": "https://files.example.com/payout-receipt.pdf"
    }
  ]
}
```

Attachments are metadata references only; files must already be stored at the
provided HTTPS URL or a safe application-relative path. Each request accepts
at most 10 attachment references, up to 25 MiB each. This API does not upload
or serve file bytes.

Admin ticket-management endpoints require an admin JWT:

- `GET /api/admin/tickets` returns status counts and the filtered ticket list.
  It accepts `page`, `limit` (maximum 100),
  `search` (ticket ID, merchant ID/name, or subject), `category`, `priority`,
  `status`, and optional `from`/`to` dates (`YYYY-MM-DD`).
- The list response includes `summary` counts for total, open, in-progress,
  resolved, and closed tickets within the selected date range, along with
  `tickets`, pagination metadata, and the applied filters.
- Example response:

```json
{
  "summary": {
    "from": "2026-11-01",
    "to": "2026-11-16",
    "total": 248,
    "counts": {
      "open": 76,
      "inProgress": 42,
      "resolved": 112,
      "closed": 18
    }
  },
  "tickets": [
    {
      "ticketId": "TKT000248",
      "merchantId": "MCH0001",
      "merchantName": "Alpha Digital Pvt. Ltd.",
      "merchantEmail": "support@example.com",
      "merchantMobile": "+919999999999",
      "subject": "Payout not received",
      "category": "Payout Issue",
      "priority": "high",
      "status": "open",
      "createdAt": "2026-11-16T10:00:00+05:30",
      "updatedAt": "2026-11-16T10:00:00+05:30"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 248,
    "totalPages": 13,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "filters": {
    "search": null,
    "category": null,
    "priority": null,
    "status": null,
    "from": "2026-11-01",
    "to": "2026-11-16"
  }
}
```

- `GET /api/admin/tickets/stats?from=2026-11-01&to=2026-11-16` returns total,
  open, in-progress, resolved, and closed counts for the selected date range.
- `GET /api/admin/tickets/:ticketId` returns ticket, merchant, attachment, and
  conversation details.
- `POST /api/admin/tickets/:ticketId/messages` adds an admin reply.
  To attach an image by URL only, include `imageUrl` in the JSON body:

```http
POST /api/admin/tickets/TKT000245/messages
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "message": "We found the issue. Please see the screenshot.",
  "imageUrl": "https://files.example.com/ticket-screenshot.png"
}
```

  `imageUrl` must be an HTTPS URL. The API stores the URL as attachment
  metadata; it does not upload, fetch, or store the image file itself.
- `PATCH /api/admin/tickets/:ticketId/status` changes status to `open`,
  `in_progress`, `resolved`, or `closed`.

Ticket IDs are returned in `TKT000001` format. Priority values are `low`,
`medium`, or `high`; new tickets default to `medium` and `open`. Closed tickets
cannot receive further replies. The migration creates `support_tickets`,
`support_ticket_messages`, and `support_ticket_attachments` automatically at
startup.

## Gateway accounts and settings

Gateway settings APIs require an admin JWT. Use them to add custom gateway
accounts and manage whether each account supports payin, payout, or both:

- `GET /api/admin/gateways` returns separate `payin` and `payout` objects,
  each with its own gateways list and pagination, plus overall dashboard
  counts in `summary`. Filters: `search`, `direction` (`payin`, `payout`, or
  `both`), `status` (`enabled` or `disabled`), `page`, and `limit` (maximum
  100). Accounts configured for `both` appear in both lists.
- `POST /api/admin/gateways` creates a gateway account.
- `GET /api/admin/gateways/:gatewayId` returns account details, including the
  credential values, to an authenticated admin.
- `PATCH /api/admin/gateways/:gatewayId` updates provider details, fees,
  payment methods, or replaces credentials.
- `PATCH /api/admin/gateways/:gatewayId/status` enables or disables an account.

Example list response:

```json
{
  "summary": {
    "totalAccounts": 8,
    "activeAccounts": 5,
    "totalPayin": 6,
    "activePayin": 4,
    "totalPayout": 5,
    "activePayout": 3
  },
  "payin": {
    "total": 6,
    "active": 4,
    "gateways": [
      {
        "id": 1,
        "providerName": "Razorpay",
        "code": "RZP_MAIN",
        "direction": "both",
        "paymentMethods": ["UPI", "Card"],
        "chargePercent": 0.5,
        "status": "enabled",
        "credentialsConfigured": true,
        "credentialKeys": ["keyId", "keySecret"],
        "createdAt": "2026-11-16T14:22:00+05:30",
        "updatedAt": "2026-11-16T14:22:00+05:30"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 6,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  },
  "payout": {
    "total": 5,
    "active": 3,
    "gateways": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  },
  "filters": {
    "search": null,
    "direction": null,
    "status": null
  }
}
```

Create a gateway account:

```http
POST /api/admin/gateways
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "providerName": "Razorpay",
  "code": "RZP_MAIN",
  "direction": "both",
  "paymentMethods": ["UPI", "Card", "Net Banking"],
  "chargePercent": 0.5,
  "credentials": {
    "keyId": "<gateway-key-id>",
    "keySecret": "<gateway-key-secret>",
    "webhookSecret": "<gateway-webhook-secret>"
  },
  "status": "disabled"
}
```

Provider names and credential keys are custom. Credentials must be supplied as
string values, are encrypted at rest using `MERCHANT_DATA_KEY`, and are never
included in the gateway list response. The create, detail, and update
responses return the full credentials to the authenticated admin. Keep
administrator access restricted and protect these responses. New accounts
default to `disabled`. These endpoints manage settings only; they do not
currently route payment requests through gateway provider APIs.

## Payout transactions

Merchants can submit payout requests with `POST /api/payouts`. The merchant
must have payouts enabled. Requests are created with `pending` status and do
not initiate a bank transfer; an administrator or integrated payout provider
must process the request and update its status.

```json
{
  "reference": "PO-10001",
  "orderId": "ORDER-10001",
  "amount": 2500.00,
  "currency": "INR",
  "beneficiaryName": "Example Recipient",
  "accountNumber": "123456789012",
  "ifsc": "ABCD0123456",
  "customerEmail": "recipient@example.com",
  "description": "Order refund"
}
```

Beneficiary account numbers are encrypted at rest with `MERCHANT_DATA_KEY`.
Payout responses expose only the last four digits. The merchant can list their
requests with `GET /api/payouts` or retrieve one with `GET /api/payouts/:id`.

Admin payout endpoints support:

- `GET /api/admin/payout/stats` for total, today, successful payout, and commission summaries.
- `GET /api/admin/payout/transactions` with `search`, `merchantId`, `provider`,
  `status`, `settlement`, `from`, `to`, `page`, and `limit` filters.
- `GET /api/admin/payout/transactions/:id` for transaction details.
- `PATCH /api/admin/payout/transactions/:id/status` to update `status`
  (`pending`, `succeeded`, `failed`), `settlement` (`pending`, `settled`,
  `failed`), `utr`, or `paymentId`.
- `GET /api/admin/payout/export.csv` to export matching transactions.

## Project architecture

Each API module uses routes, controllers, services, and repositories. Merchant
accounts are stored in `merchants`; admin accounts are stored separately in
`admins`. Tickets, ticket replies, and attachment metadata are stored in
`support_tickets`, `support_ticket_messages`, and
`support_ticket_attachments`. Gateway account configuration is stored in
`payment_gateway_accounts`, and payout requests are stored in
`payout_transactions`. Merchant passwords and admin passwords are stored as bcrypt hashes.
Admins have no public registration endpoint; provision them with the
`admin:create` command.

The admin login token includes `role: "admin"` and cannot be used to access
merchant payment routes.

Example request:

```http
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your-admin-password"
}
```


curl -X POST https://control.trustpay24.online/api/merchant/v1/payins \
  -H "X-Api-Key: $KEY" -H "X-Api-Secret:$SECRET" -H "Content-Type: application/json" \
  -d '{
    "reference": "ORD-10231",
    "amount": 1499.00,
    "method": "UPI",
    "payer": { "name": "Asha Kumar", "phone": "9876543210" },
    "returnUrl": "https://shop.example/orders/10231",
    "expiresInSec": 900,
    "narration": "Order 10231"
  }'