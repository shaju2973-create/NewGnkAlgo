# Deploy GnkAlgo on an Oracle Cloud Ubuntu VM

This runbook deploys the repository's Docker Compose stack on an OCI ARM64 VM. Run commands on the VM unless a step explicitly says **OCI Console** or **local computer**.

## Safety gates

Before changing SSH or firewall rules:

1. Confirm that `130.210.34.12` is still the administrator's public IPv4 address.
2. Keep the current SSH session open.
3. Open and verify a second key-based SSH session.
4. Do not disable password or root authentication until the second session works.
5. Back up an existing database and environment file before replacing or migrating anything.

Never expose application port `3000`, PostgreSQL `5432`, WebSocket `8765`, ZeroMQ `5555`, or the Docker API. This repository currently implements HTTP on internal port `3000`; it has no separate WebSocket or ZeroMQ listener.

## 1. Create or verify OCI infrastructure

In **OCI Console**:

1. Create or select a VCN with a public subnet, Internet Gateway, and route rule `0.0.0.0/0 -> Internet Gateway`.
2. Create an Ubuntu 24.04 ARM64 instance in that subnet. Attach an SSH public key; do not configure password-only access.
3. Assign a reserved public IPv4 address so DNS does not change after a stop/start.
4. Attach one dedicated NSG to the instance VNIC and add these stateful ingress rules:

   | Source | Protocol | Destination port | Purpose |
   | --- | --- | ---: | --- |
   | `130.210.34.12/32` | TCP | 22 | SSH administration |
   | `0.0.0.0/0` | TCP | 80 | HTTP redirect and ACME |
   | `0.0.0.0/0` | TCP | 443 | HTTPS and secure WebSockets |

5. Keep normal outbound access for package downloads, certificate issuance, Twilio, and broker APIs.
6. Review the subnet security list. OCI combines NSG and security-list rules; remove redundant broad ingress such as public SSH instead of assuming the NSG overrides it.
7. Enable OCI boot-volume backups and the Oracle Cloud Agent monitoring plugins appropriate for the tenancy.

OCI requires a public subnet, Internet Gateway route, public IP, and matching NSG or security-list ingress for direct internet access. Oracle recommends narrowly scoped ingress and regular review of network changes.

## 2. Configure DNS

At the authoritative DNS provider, create:

- `A` record: `gnkalgo.com` -> the reserved OCI public IPv4 address.
- Optional `A` record: `www.gnkalgo.com` -> the same address.

Add an `AAAA` record only when IPv6 is configured end to end in the VCN, subnet, VNIC, NSG, host firewall, and nginx.

Verify from a local computer:

```sh
dig +short A gnkalgo.com
dig +short A www.gnkalgo.com
```

Do not request a certificate until the records resolve to this VM.

## 3. Connect and inspect the VM

```sh
ssh -i /path/to/private_key ubuntu@VM_PUBLIC_IP
uname -a
dpkg --print-architecture
lsb_release -a
free -h
df -hT
timedatectl
ip -brief address
sudo ss -lntup
sudo systemctl --failed
```

Expected architecture is `arm64`/`aarch64`. Investigate unexpected listeners, services, disk pressure, or an existing GnkAlgo installation before continuing.

## 4. Patch and configure Ubuntu

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git openssl ufw fail2ban unattended-upgrades
sudo timedatectl set-timezone Asia/Kolkata
sudo systemctl enable --now systemd-timesyncd fail2ban unattended-upgrades
timedatectl status
```

If the upgrade installs a new kernel, schedule a controlled reboot before production deployment and reconnect afterward.

## 5. Install Docker Engine and Compose

Use Docker's official apt repository rather than the convenience script:

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
```

Do not add general login users to the `docker` group unless they require root-equivalent Docker access.

## 6. Create the service account and install the repository

For a new installation:

```sh
sudo adduser --system --group --home /opt/gnkalgo gnkalgo
sudo install -d -o gnkalgo -g gnkalgo -m 0750 /opt/gnkalgo
sudo -u gnkalgo git clone https://github.com/shaju2973-create/NewGnkAlgo.git /opt/gnkalgo/app
cd /opt/gnkalgo/app
git status --short
git log -1 --oneline
```

For an existing installation, first record `git status`, back up every file that will be changed, and use `git pull --ff-only` only when local changes will not be overwritten.

## 7. Prepare protected configuration

```sh
cd /opt/gnkalgo/app
sudo install -d -o gnkalgo -g gnkalgo -m 0700 secrets backups
sudo cp deploy/env.production.template .env.production
sudo chown gnkalgo:gnkalgo .env.production
sudo chmod 0600 .env.production
sudo sh -c 'umask 077; openssl rand -hex 32 > secrets/postgres_password'
sudo sh -c 'umask 077; printf "postgres:5432:gnkalgo:gnkalgo:%s\n" "$(cat secrets/postgres_password)" > secrets/postgres_pgpass'
```

Edit without printing the file to shared terminal logs:

```sh
sudoedit /opt/gnkalgo/app/.env.production
```

Replace every placeholder. Set `DATABASE_URL` to `postgres://gnkalgo:<same-hex-password>@postgres:5432/gnkalgo`. Generate `COOKIE_SECRET`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_TOKEN`, and the `DATA_KEYRING_JSON` key independently. Preserve valid existing production secrets; rotating JWT or encryption keys has user-impacting consequences.

Check only variable status, never values:

```sh
sudo awk -F= '
  /^[A-Z0-9_]+=/ {
    state=($0 ~ /REPLACE|xxxx/) ? "placeholder" : (($2 == "") ? "empty" : "configured");
    print $1 ": " state
  }
' .env.production
```

## 8. Build and test the application image

```sh
cd /opt/gnkalgo/app
sudo docker compose --env-file .env.production config --quiet
sudo docker compose --env-file .env.production build app
```

The multi-stage Docker build runs TypeScript validation and the repository test suite before producing the runtime image.

## 9. Start PostgreSQL and apply migrations

For a new database:

```sh
sudo docker compose --env-file .env.production up -d postgres
sudo docker compose --env-file .env.production --profile tools run --rm migrate
```

For an existing database, make and verify a backup before migration:

```sh
sudo env BACKUP_DIR=/opt/gnkalgo/app/backups sh deploy/scripts/backup.sh
sudo ls -lh backups
sudo sha256sum --check backups/*.sha256
sudo docker compose --env-file .env.production --profile tools run --rm migrate
```

Never delete or recreate the `postgres_data` volume during an update.

## 10. Bootstrap the first TLS certificate

Start the app and HTTP-only nginx configuration:

```sh
sudo docker compose \
  --env-file .env.production \
  -f compose.yaml \
  -f deploy/compose.bootstrap.yaml \
  up -d postgres app nginx
```

Request the certificate. Omit the `www` argument if that DNS record is not configured, and remove `www.gnkalgo.com` from the nginx configuration before the final start.

```sh
sudo docker compose --env-file .env.production --profile tools run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d gnkalgo.com -d www.gnkalgo.com \
  --email YOUR_CERTIFICATE_EMAIL --agree-tos --no-eff-email
```

Start the normal HTTPS configuration:

```sh
sudo docker compose --env-file .env.production up -d --remove-orphans
sudo docker compose --env-file .env.production ps
```

## 11. Configure the host firewall safely

First verify the administrator's current public IPv4 from their local computer. Then, while keeping the original session open:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 130.210.34.12/32 to any port 22 proto tcp comment 'trusted SSH'
sudo ufw allow 80/tcp comment 'HTTP ACME redirect'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw show added
sudo ufw enable
sudo ufw status numbered
```

Open a second SSH connection and confirm it works before changing `sshd_config`. Docker warns that published container ports can bypass some UFW rules; this Compose file intentionally publishes only ports 80 and 443. OCI NSG rules remain the outer enforcement layer.

## 12. Validate production

```sh
cd /opt/gnkalgo/app
sudo docker compose --env-file .env.production ps
sudo docker compose --env-file .env.production logs --tail=100 app nginx postgres
curl --fail --silent --show-error http://gnkalgo.com/health/live
curl --fail --silent --show-error https://gnkalgo.com/health/live
curl -I https://gnkalgo.com/
sudo ss -lntup
```

Expected host listeners are SSH `22`, HTTP `80`, and HTTPS `443`. Confirm externally that ports `3000`, `5432`, `5555`, and `8765` are closed. Confirm HTTP redirects to HTTPS and the health endpoint returns `{"ok":true}`.

## 13. Backups, certificate renewal, and updates

Schedule database backups under root and copy encrypted backups to a separate OCI location. Test restoration periodically. A renewal job should run Certbot, reload nginx only after successful renewal, and alert on failure.

Safe application update sequence:

```sh
cd /opt/gnkalgo/app
sudo env BACKUP_DIR=/opt/gnkalgo/app/backups sh deploy/scripts/backup.sh
sudo -u gnkalgo git fetch origin
sudo -u gnkalgo git pull --ff-only origin master
sudo docker compose --env-file .env.production build app
sudo docker compose --env-file .env.production --profile tools run --rm migrate
sudo docker compose --env-file .env.production up -d --remove-orphans
curl --fail --silent --show-error https://gnkalgo.com/health/live
```

## 14. Rollback

Before every update, record the current commit and image ID:

```sh
git rev-parse HEAD
sudo docker image inspect gnkalgo:local --format '{{.Id}}'
```

If only the app image fails, redeploy the previously tagged image. Restore PostgreSQL only when a reviewed migration requires it, and only from a verified backup. Do not mix an older database with newer irreversible migrations without checking migration compatibility.

## Official references

- [OCI: Creating an instance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm)
- [OCI: Network security groups](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm)
- [OCI: Security rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)
- [OCI: Networking security guidance](https://docs.oracle.com/en-us/iaas/Content/Security/Reference/networking_security.htm)
- [Docker: Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
