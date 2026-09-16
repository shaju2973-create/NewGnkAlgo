# Production Docker deployment

This deployment wraps the existing application without changing its behavior. The app and PostgreSQL have no host-published ports; nginx is the only public container. The selected Node, PostgreSQL, nginx, and Certbot images publish Linux/ARM64 variants.

## 1. Host prerequisites

Use Ubuntu 24.04 ARM64 with Docker Engine and the Compose plugin. Point the `gnkalgo.com` and optional `www.gnkalgo.com` DNS records to the VM before requesting certificates. At both OCI NSG/security-list and UFW layers, expose only TCP 80/443 publicly and TCP 22 from the currently verified administrator IP. Do not enforce the SSH restriction until a second key-based session succeeds.

## 2. Secrets and environment

Run from the repository root:

```sh
install -d -m 700 secrets backups
cp deploy/env.production.template .env.production
chmod 600 .env.production
openssl rand -base64 36 > secrets/postgres_password
chmod 600 secrets/postgres_password
printf 'postgres:5432:gnkalgo:gnkalgo:%s\n' "$(cat secrets/postgres_password)" > secrets/postgres_pgpass
chmod 600 secrets/postgres_pgpass
```

Replace every placeholder in `.env.production`. URL-encode the same PostgreSQL password in `DATABASE_URL`. Generate each application secret independently; do not print or commit it: use 48 random base64 bytes for `COOKIE_SECRET`, `JWT_SECRET`, and `ADMIN_BOOTSTRAP_TOKEN`, and 32 for the `DATA_KEYRING_JSON` key.

Keep existing production secrets. Rotating `JWT_SECRET` signs everyone out; rotating the data key without retaining the old key version makes stored broker tokens unreadable.

## 3. Initial TLS bootstrap

The normal nginx configuration requires an existing certificate. For the first issuance only, temporarily mount `deploy/nginx/bootstrap-http.conf` in the nginx service, then:

```sh
docker compose --env-file .env.production up -d postgres app nginx
docker compose --env-file .env.production --profile tools run --rm certbot certonly --webroot -w /var/www/certbot -d gnkalgo.com -d www.gnkalgo.com
```

Restore the normal `gnkalgo.conf` mount and recreate nginx. If `www` has no DNS record, omit its `-d` argument and remove it from nginx `server_name` before issuance.

## 4. Migrate and deploy

Back up any existing database before migrations. The migration runner records filenames and applies each repository migration once:

```sh
docker compose --env-file .env.production build app
docker compose --env-file .env.production --profile tools run --rm migrate
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
curl --fail --silent --show-error https://gnkalgo.com/health/live
```

Before an update, run `deploy/scripts/backup.sh`, build and test the image, run migrations, then use `docker compose up -d`. Roll back by restoring the previous image tag and, only when a migration demands it, a tested database backup.

## 5. Operations

- Schedule `deploy/scripts/backup.sh` and copy encrypted backups off-instance. Test restores regularly.
- Renew certificates with the Certbot tools profile and reload nginx after success.
- Monitor container health, restart counts, disk space, TLS expiry, HTTP latency/error rate, PostgreSQL availability, and backup age.
- Remove `ADMIN_BOOTSTRAP_TOKEN` after the initial administrator is created and recreate the app container.
- The repository has no WebSocket or ZeroMQ listener today. Nginx forwards protocol upgrades, but ports 8765 and 5555 are intentionally not exposed or invented.

## OCI and host actions not automated here

Confirm the exact instance, VCN, subnet, route table, Internet Gateway, reserved public IP, NSG/security list, backup policy, and Monitoring Agent in OCI before changing them. Confirm the administrator's current public address before restricting SSH to `130.210.34.12/32`. These changes can lock out the operator and require authenticated access to the actual tenancy, so this repository does not apply them.
