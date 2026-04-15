#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Manual production database dump (Free-plan stopgap).
# ─────────────────────────────────────────────────────────────────────────────
# Why this exists:
#   The Supabase Free plan does NOT include automated backups or PITR. Until
#   we move to Pro, we run this script manually (target cadence: weekly) so
#   there's at least *something* to roll back to after a bad migration, an
#   accidental DELETE, or a compromised dev machine.
#
# What it does:
#   1. Schema dump  → backups/<ts>/schema.sql        (DDL only, fast)
#   2. Data dump    → backups/<ts>/data.sql          (rows, large)
#   3. Roles dump   → backups/<ts>/roles.sql         (auth.users etc.)
#   4. Manifest     → backups/<ts>/manifest.json     (git sha + timestamp)
#
# Restore:
#   See docs/incident-response.md §8 for the restore procedure.
#
# Storage:
#   The `backups/` directory is gitignored. Move the dump off-machine after
#   running (cloud drive, encrypted external disk). DO NOT commit dumps —
#   they contain user PII.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Resolve repo root regardless of where the script is invoked from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT/apps/web"

TS="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT_DIR="$REPO_ROOT/backups/$TS"
mkdir -p "$OUT_DIR"

GIT_SHA="$(git rev-parse --short HEAD)"

echo "[backup] writing to $OUT_DIR (sha=$GIT_SHA)"

# Schema only (DDL). Fast — verifies the tooling works before we wait on data.
echo "[backup] (1/3) schema..."
npx supabase db dump --linked --schema public > "$OUT_DIR/schema.sql"

# Data only (rows). This is the slow part for any real-sized DB.
echo "[backup] (2/3) data..."
npx supabase db dump --linked --data-only > "$OUT_DIR/data.sql"

# Roles + auth.users. Required for a clean restore.
echo "[backup] (3/3) roles..."
npx supabase db dump --linked --role-only > "$OUT_DIR/roles.sql"

cat > "$OUT_DIR/manifest.json" <<EOF
{
  "timestamp": "$TS",
  "git_sha": "$GIT_SHA",
  "supabase_project": "wlxkvnbncfzkmxzexgxt",
  "files": ["schema.sql", "data.sql", "roles.sql"],
  "restore_doc": "docs/incident-response.md §8"
}
EOF

SIZE="$(du -sh "$OUT_DIR" | cut -f1)"
echo "[backup] done — $SIZE in $OUT_DIR"
echo "[backup] REMINDER: move this dump off-machine (it contains user PII) and"
echo "[backup] update the 'last run' date in docs/incident-response.md §5."
