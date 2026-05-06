#!/usr/bin/env bash
# Vercel Ignored Build Step
# -----------------------------------------------------------------------------
# Wired into apps/web/vercel.json via "ignoreCommand".
#
# Vercel exit-code semantics (NOT typical shell convention — verify against
# Vercel docs before changing):
#   exit 0 -> skip the build
#   exit 1 -> proceed with the build
#
# Decision tree (first match wins):
#   1. main branch              -> ALWAYS build (production must never skip)
#   2. dependabot/* branch      -> ALWAYS skip (no preview value)
#   3. chore/* docs/* refactor/*
#      test/* branch            -> ALWAYS skip (internal/infra, no UX impact)
#   4. feat/* fix/* branch      -> ALWAYS build (user-facing preview needed)
#   5. Diff-only paths (all changed files match) -> SKIP:
#         supabase/migrations/**
#         memory/**
#         .claude/**
#         apps/web/scripts/**         (this script + sibling infra scripts)
#         *.md  (EXCEPT apps/web/app/**/*.md — those are content pages)
#   6. Default                  -> BUILD (safe fallback)
#
# Env vars Vercel provides:
#   VERCEL_GIT_COMMIT_REF     branch name
#   VERCEL_GIT_PREVIOUS_SHA   last deployed sha (may be empty on first deploy)
# -----------------------------------------------------------------------------

set -uo pipefail

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-}"

log() { echo "[vercel-ignore] $*"; }

# 1. main always builds
if [[ "$BRANCH" == "main" ]]; then
  log "branch=main -> BUILD"
  exit 1
fi

# 2. dependabot skip (preserves prior behavior)
if [[ "$BRANCH" == dependabot/* ]]; then
  log "branch=$BRANCH -> SKIP (dependabot)"
  exit 0
fi

# 3. internal/infra branch prefixes -> skip
case "$BRANCH" in
  chore/*|docs/*|refactor/*|test/*)
    log "branch=$BRANCH -> SKIP (internal prefix)"
    exit 0
    ;;
esac

# 4. user-facing branch prefixes -> build
case "$BRANCH" in
  feat/*|fix/*)
    log "branch=$BRANCH -> BUILD (user-facing prefix)"
    exit 1
    ;;
esac

# 5. Path-only diff check.
# If we cannot resolve a previous sha, default to BUILD (safe).
if [[ -z "$PREV_SHA" ]]; then
  log "no VERCEL_GIT_PREVIOUS_SHA -> BUILD (cannot determine diff)"
  exit 1
fi

# Vercel runs this with cwd = apps/web (the project root in vercel.json).
# Run git from the repo root so paths are repo-relative.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  log "git rev-parse failed -> BUILD (cannot determine diff)"
  exit 1
fi

CHANGED="$(git -C "$REPO_ROOT" diff --name-only "$PREV_SHA" HEAD 2>/dev/null || true)"
if [[ -z "$CHANGED" ]]; then
  log "git diff returned no files -> BUILD (be safe)"
  exit 1
fi

log "changed files vs $PREV_SHA:"
echo "$CHANGED" | sed 's/^/[vercel-ignore]   /'

# Walk every changed file; if any one of them is "build-worthy", build.
# Otherwise (every file is skip-worthy), skip.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue

  # Skip-worthy paths:
  case "$f" in
    supabase/migrations/*|*/supabase/migrations/*)
      continue ;;
    memory/*|*/memory/*)
      continue ;;
    .claude/*|*/.claude/*)
      continue ;;
    apps/web/scripts/*)
      continue ;;
  esac

  # *.md handling: skip unless under apps/web/app/ (content pages).
  if [[ "$f" == *.md ]]; then
    if [[ "$f" == apps/web/app/* ]]; then
      log "build-worthy file (content md): $f -> BUILD"
      exit 1
    fi
    continue
  fi

  # Anything else is build-worthy.
  log "build-worthy file: $f -> BUILD"
  exit 1
done <<< "$CHANGED"

log "all changed files match skip rules -> SKIP"
exit 0
