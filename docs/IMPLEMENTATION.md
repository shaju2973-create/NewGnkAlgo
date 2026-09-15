# Implementation guide

## Architecture and flows

`users` is the stable account and `user_identities` stores a unique Google `sub` or canonical E.164 mobile number. Google credentials are verified server-side for signature, audience, issuer, expiry and verified email. Twilio Verify owns OTP generation; the app stores only a phone hash, expiry, attempt count and consumption state. Existing identities sign into the existing user rather than creating duplicates. Never auto-link two identities from matching user-supplied data: require login plus fresh verification of the identity being added.

The browser receives an opaque server-session cookie. Only its SHA-256 hash is stored. A broker connect link navigates to `/api/v1/auth/redirect/:broker`; the server stores a hashed, single-use, ten-minute state and redirects to the broker. Broker-hosted login and 2FA remain untouched. The callback atomically consumes state, exchanges the one-time code through fixed egress, encrypts the access token and upserts the daily connection.

Zerodha's documented request-token/checksum handshake is adapter-specific and OAuth-style, not standards-identical OAuth 2.0. Upstox documents an authorization-code exchange. Dhan, Fyers and Angel One remain disabled until their current approved redirect contracts are added and tested. Never collect broker passwords, PINs or TOTPs and never automate login screens.

## Minimal frontend

Load `https://accounts.google.com/gsi/client`, call `google.accounts.id.initialize({client_id, callback})`, render the official button, and in the callback POST `{credential: response.credential}` to `/api/v1/auth/google` with JSON and `credentials: "include"`. Never trust a browser-only JWT decode.

For mobile, normalize input with a phone-number library, POST `{mobile}` to `/api/v1/auth/otp/request`, then show an accessible numeric input and POST `{mobile,code}` to `/api/v1/auth/otp/verify`. Disable resend briefly, display a countdown, and use generic responses to reduce account enumeration. Broker buttons should navigate (not AJAX) to `/api/v1/auth/redirect/upstox`. The kill switch should require reauthentication in a hardened deployment plus typed confirmation `KILL`.

## Production controls

- Use TLS/HSTS, Secure/HttpOnly/SameSite cookies, strict CSP, small bodies and trusted-ingress-only proxy headers.
- Replace the process-local limiter with Redis limits by IP, salted phone hash, user and broker. Suggested ceilings: OTP send 3/15 minutes/phone and 10/hour/IP; verify 5/challenge; OAuth start 10/minute/user; callback 20/minute/IP; kill switch 5/minute/user.
- Move data keys to KMS/HSM/Key Vault. Add a new key version, make it active, re-encrypt each row transactionally, then retire the old version only after verification. AES-GCM uses random 96-bit IVs and AAD binding user, broker and field.
- Redact cookies, authorization headers, callback query strings, codes, state, OTP, phone/email, tokens, client secrets, vendor keys and encryption material. Audit event identifiers and result classes, not PII.
- Route every broker token and order client through a static-IP NAT/proxy and block direct internet egress at the network layer. The included proxy is the application seam, not proof of infrastructure compliance.
- Run an external idempotent purge at 15:30 Asia/Kolkata and retain startup/minute reconciliation. Do not persist or cycle refresh tokens. The requested cutoff is a wall-clock policy, including holidays.
- The kill switch first disables worker state and deletes tokens transactionally. Add official broker revocation and worker cancellation. It cannot recall orders already accepted by an exchange.
- Add least-privilege database roles, encrypted PITR backups, clock synchronization, dependency/SAST/secret scanning, alerts on purge failures, incident runbooks, threat modeling and penetration testing.

## Edge cases and verification

Handle unique-constraint registration races by retrying and reading the winner. Reject reused, expired or broker-mismatched state, arbitrary redirect URLs and request-provided endpoints/scopes. Contract-test every adapter against official sandboxes and pin reviewed API versions. Run migrations, then `npm install`, `npm test`, and `npm run build`; add provider mocks and database integration tests before deployment.

Code alone does not establish SEBI compliance. Broker approval, current exchange/SEBI requirements, static-IP verification, operational controls, algo registration/tagging where applicable, and qualified legal/compliance review are external gates.
