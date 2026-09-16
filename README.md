# gnkalgo authentication and broker-routing starter

Security-first Node.js/TypeScript + PostgreSQL boilerplate for:

- gnkalgo-owned email/password accounts with mandatory mobile OTP verification;
- login with short-lived JWT access tokens and rotating HttpOnly refresh JWTs;
- mobile OTP password recovery without a third-party email provider;
- broker-hosted login/2FA redirects and server-side code exchange;
- AES-256-GCM encryption of broker tokens and vendor credentials;
- emergency kill switch, 15:30 Asia/Kolkata token purge, and static-IP broker egress.

This is a reference implementation, not a certification or legal opinion. Broker contracts and current SEBI/exchange rules remain authoritative.

## Setup

1. Copy `.env.example` to a protected environment file. Generate `COOKIE_SECRET`, `JWT_SECRET`, the AES data key, and one-time `ADMIN_BOOTSTRAP_TOKEN` independently with `openssl rand -base64 48` (AES uses `openssl rand -base64 32`).
2. Run `migrations/001_init.sql`, followed by `migrations/002_local_accounts_jwt.sql`.
3. Run `npm ci`, `npm run build`, and `npm test`.
4. Serve the app behind HTTPS. It binds to `127.0.0.1:3000` by default.
5. Register exact broker callback URLs and whitelist the fixed egress IPv4.

The first registration using `ADMIN_EMAIL` must also supply the one-time `ADMIN_BOOTSTRAP_TOKEN`; other accounts cannot self-assign admin. Remove or rotate that token after the admin is created.

## Pages

- `/create-account` — email, password and verified mobile registration
- `/login` — email/password sign-in
- `/forgot-password` — mobile OTP password reset

## Authentication routes

- `POST /api/v1/auth/otp/request` `{ mobile, purpose: "register" }`
- `POST /api/v1/auth/otp/verify` `{ mobile, code }`
- `POST /api/v1/auth/register` `{ displayName, email, password, mobileVerificationToken, adminBootstrapToken? }`
- `POST /api/v1/auth/login` `{ email, password }`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/forgot-password` `{ email }`
- `POST /api/v1/auth/reset-password` `{ email, code, newPassword }`
- `GET /api/v1/auth/me`

Broker routes accept either the HttpOnly access JWT cookie or `Authorization: Bearer <access-token>`. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for security and migration details.

## Quant platform MVP

Open `/dashboard` for the simulation desk. The reference pipeline includes deterministic OHLCV data, EMA/RSI/ATR/VWAP/momentum/volume features, explainable BUY/SELL/HOLD decisions, ATR-based stops and sizing, a drawdown kill rule, event-driven backtesting, walk-forward folds, and a QAOA-compatible binary portfolio objective.

`GET /api/v1/platform/demo?symbol=NIFTY` returns the pipeline as JSON. It is deliberately labelled `SIMULATION`: synthetic data and a classical reference optimizer are safe development defaults. Live data, trained model serving, quantum-provider jobs, persistent paper orders, and broker order placement require separately reviewed adapters. Never infer authorization to place an order from a generated signal.
