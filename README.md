# gnkalgo authentication and broker-routing starter

Security-first Node.js/TypeScript + PostgreSQL boilerplate for:

- account creation with Google Identity Services or verified mobile OTP (Twilio Verify);
- linking one user to several broker connections;
- broker-hosted login/2FA redirects and server-side code exchange;
- AES-256-GCM encryption of broker tokens and vendor credentials;
- per-user emergency kill switch and a 15:30 Asia/Kolkata token purge;
- outbound broker traffic through a required static-IP proxy in production.

This is a reference implementation, not a certification or legal opinion. Broker contracts and current SEBI/exchange rules remain authoritative. Never enable a broker adapter until its current official documentation and app approval have been reviewed.

## Quick start

1. Copy `.env.example` to `.env` and replace every placeholder. Generate 32-byte values with `openssl rand -base64 32`.
2. Create PostgreSQL, then run `psql "$DATABASE_URL" -f migrations/001_init.sql`.
3. Run `npm install`, `npm run dev`, and serve the frontend over the same HTTPS origin in production.
4. Register the exact callback URL `https://YOUR_HOST/api/v1/auth/callback/<broker>` with each broker.
5. Whitelist the proxy's fixed public IPv4 with every broker; direct egress is rejected when `NODE_ENV=production`.

The seed inserts `gnkalgo.admin@gmail.com` as an admin but does **not** bypass Google verification or create a password. The first successful Google login claims that seeded account.

## Routes

- `POST /api/v1/auth/google` `{ credential }`
- `POST /api/v1/auth/otp/request` `{ mobile }`
- `POST /api/v1/auth/otp/verify` `{ mobile, code }`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/redirect/:broker` (authenticated browser navigation)
- `GET /api/v1/auth/callback/:broker`
- `POST /api/v1/trades/kill-switch` `{ confirm: "KILL" }`

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for flow, edge cases, frontend snippets, operations, and compliance caveats. See [MASTER_PROMPT.md](MASTER_PROMPT.md) for a portable prompt usable with AI coding tools.
