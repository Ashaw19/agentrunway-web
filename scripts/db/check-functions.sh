#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Replay every migration into a throwaway Supabase Postgres, then run
# plpgsql_check over every public plpgsql function.
# ─────────────────────────────────────────────────────────────────────────────
# Why this exists:
#   plpgsql resolves columns and tables at RUN time, so a function that
#   references something missing deploys cleanly and fails on its first call.
#   00112 did exactly that to the contact_activities trigger: every activity
#   insert failed for every user from 2026-04-12 to 2026-10-06 (fixed in
#   00166). fn_org_pending_deals_summary had the same bug since 00060 (00167).
#   This turns that class of bug into a red CI check.
#
# What it does:
#   1. Starts supabase/postgres (same major/minor as prod) in Docker.
#   2. ci-bootstrap.sql: extensions prod enabled from the dashboard, plus the
#      storage tables the Storage API service creates in real Supabase.
#   3. Applies apps/web/supabase/migrations/*.sql in filename order; any failure fails the run.
#   4. Runs plpgsql-check.sql; any error-level finding fails the run.
#
# Needs Docker. No secrets, never touches prod. Run locally:
#   bash scripts/db/check-functions.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/apps/web/supabase/migrations"

# Prod runs Postgres 17.6 (checked 2026-10-06). Bump alongside prod upgrades.
IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:17.6.1.178}"
CONTAINER="arw-check-functions-$$"
PASSWORD="ci-only-throwaway"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting $IMAGE"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -v "$MIGRATIONS_DIR:/migrations:ro" \
  -v "$SCRIPT_DIR:/checks:ro" \
  "$IMAGE" >/dev/null

run_psql() {
  docker exec -e PGPASSWORD="$PASSWORD" "$CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

# The image runs its own init (roles, auth/storage schemas) before the final
# server accepts TCP connections, so wait for a real query to succeed.
for i in $(seq 1 90); do
  if run_psql -c "select 1" >/dev/null 2>&1; then break; fi
  if [ "$i" -eq 90 ]; then
    docker logs "$CONTAINER" 2>&1 | tail -60
    echo "::error::Postgres did not become ready within 3 minutes"
    exit 1
  fi
  sleep 2
done

run_psql -f /checks/ci-bootstrap.sql

applied=0
while IFS= read -r file; do
  if ! output=$(run_psql -f "/migrations/$file" 2>&1); then
    echo "$output"
    echo "::error file=apps/web/supabase/migrations/$file::Migration failed to apply on a fresh database"
    exit 1
  fi
  applied=$((applied + 1))
done < <(cd "$MIGRATIONS_DIR" && LC_ALL=C ls -1 -- *.sql)
echo "Applied $applied migrations."

if ! output=$(run_psql -f /checks/plpgsql-check.sql 2>&1); then
  echo "$output"
  # One annotation per finding so it shows on the PR.
  echo "$output" | sed -n 's/.*WARNING:  *plpgsql_check: //p' | while IFS= read -r finding; do
    echo "::error::plpgsql_check: $finding"
  done
  exit 1
fi
echo "$output"
