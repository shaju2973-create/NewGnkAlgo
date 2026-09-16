# Local-account and JWT implementation

## Account creation

The user requests and verifies an SMS OTP through Twilio Verify. A successful verification creates a random, hashed, single-use mobile verification grant lasting ten minutes. Registration atomically consumes that grant, creates the `users` row, stores a scrypt password hash, and binds the verified E.164 number as a unique mobile identity. Email and mobile uniqueness constraints prevent duplicate accounts.

Passwords must contain 12–128 characters, uppercase, lowercase, and a number. They are hashed with Node.js scrypt using a random 128-bit salt; plaintext passwords are never stored or logged. Five failed logins lock the credential for fifteen minutes. Production should add breached-password screening and a Redis-backed distributed limiter.

`gnkalgo.admin@gmail.com` is configured through `ADMIN_EMAIL`. Its first registration additionally requires the independently generated `ADMIN_BOOTSTRAP_TOKEN`. Remove that token from the service environment after the admin account is created and restart the service.

## JWT sessions

Access JWTs use HS256, issuer/audience validation, and a fifteen-minute lifetime. Refresh JWTs last thirty days, rotate after every use, and are tracked by a hash and token-family identifier in PostgreSQL. Reuse revokes the entire family. Both are delivered as Secure, HttpOnly, SameSite=Strict cookies; API clients may also use the returned access token as a Bearer token. Keep `JWT_SECRET` in OCI Vault in mature production and rotate it with a planned all-session logout.

## Password recovery

The forgot-password endpoint always returns the same generic response. If an account exists, Twilio sends an OTP to its already verified mobile. Successful reset replaces the password hash and revokes every refresh token for that user. It never accepts a new mobile number during recovery.

## Migration and deployment

Back up PostgreSQL before applying `002_local_accounts_jwt.sql`. It adds credentials, refresh tokens, verification grants, reset challenges, and OTP purpose fields. It removes only the untouched placeholder admin seed; claimed accounts and broker data are preserved. The legacy `google` enum label and `app_sessions` table may remain in databases created with migration 001, but no route or package can use Google sign-in.

For `/opt/gnkalgo` on Ubuntu:

```bash
cd /opt/gnkalgo
sudo -u postgres pg_dump --format=custom --file=/var/backups/gnkalgo/pre-jwt.dump gnkalgo
sudo -u gnkalgo git pull --ff-only origin master
sudo -u gnkalgo npm ci
sudo -u gnkalgo npm run build
sudo -u gnkalgo npm test
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file=migrations/002_local_accounts_jwt.sql
sudo systemctl restart gnkalgo
curl --fail https://gnkalgo.com/health/live
```

Never display the environment file or put secrets in Git. Use TLS/HSTS, strict origin checks, Redis rate limits, secret-redacted logs, least-privilege database roles, encrypted backups, and OCI Vault. Broker credentials and tokens remain separate from user-login JWTs.
