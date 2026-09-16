#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL
for migration in /migrations/*.sql; do
  filename="$(basename "$migration")"
  applied="$(psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM schema_migrations WHERE filename = :'filename'" --set="filename=$filename")"
  if [ "$applied" = "1" ]; then
    echo "Already applied: $filename"
    continue
  fi
  echo "Applying: $filename"
  psql -v ON_ERROR_STOP=1 --file="$migration"
  psql -v ON_ERROR_STOP=1 --set="filename=$filename" -c "INSERT INTO schema_migrations(filename) VALUES (:'filename')"
done
