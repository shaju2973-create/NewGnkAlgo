#!/bin/sh
set -eu
umask 077
backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/gnkalgo-$timestamp.dump"
docker compose exec -T postgres pg_dump --username="${POSTGRES_USER:-gnkalgo}" --dbname="${POSTGRES_DB:-gnkalgo}" --format=custom > "$output"
test -s "$output"
sha256sum "$output" > "$output.sha256"
chmod 600 "$output" "$output.sha256"
echo "Backup created: $output"
