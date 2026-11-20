# UltraPay

UltraPay is a payment gateway API built with Express and MySQL.

## Endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/admin/login`
- `POST /api/admin/merchants`
- `GET /api/admin/merchants`
- `GET /api/admin/merchants/:merchantId`
- `PATCH /api/admin/merchants/:merchantId`
- `PATCH /api/admin/merchants/:merchantId/status`
- `POST /api/admin/merchants/:merchantId/token/reset`
- `GET /api/admin/merchants/:merchantId/ledger`
- `POST /api/admin/merchants/:merchantId/ledger`
- `GET /api/payments`
- `POST /api/payments`
- `GET /api/payments/:id`
- `PATCH /api/payments/:id/status`

Payment endpoints require `Authorization: Bearer <token>`.
Admin login returns an admin-role JWT and never includes the password hash in its response.
Merchant management endpoints require an admin JWT. Payment endpoints accept a
merchant JWT or the generated `X-Merchant-Id` and `X-Merchant-Token` headers.

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

The API generates the merchant ID, API token, and a temporary password. The
token and password are returned only in the create response; securely share
them with the merchant. The API token is stored as a hash and can be used on
payment requests with `X-Merchant-Id` and `X-Merchant-Token` headers. The
merchant password is stored as a bcrypt hash.

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

## Project architecture

Each API module uses routes, controllers, services, and repositories. Merchant
accounts are stored in `merchants`; admin accounts are stored separately in
`admins`. Merchant passwords and admin passwords are stored as bcrypt hashes.
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
