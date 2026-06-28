#!/usr/bin/env bash
# Vercel Ignored Build Step
# -----------------------------------------------------------------------------
# Wired into apps/web/vercel.json via "ignoreCommand".
#
# Purpose: skip the Vercel build when the web app (and everything it actually
# depends on) is unchanged since the LAST SUCCESSFUL DEPLOY. This stops us
# paying ~4 min of Build CPU for commits that only touch memory/, docs/, or
# apps/mobile/** — none of which the production web app rebuilds for.
#
# Vercel exit-code semantics (NOT typical shell convention — verify against
# Vercel docs before changing):
#   exit 0 -> SKIP the build
#   exit 1 -> PROCEED with the build
#
# Decision tree (first match wins, conservative = build):
#   1. main branch                       -> ALWAYS build (production never skips)
#   2. i18n web/shared locale change     -> ALWAYS build (out-of-graph dep, below)
#   3. Delegate to `turbo-ignore`        -> exit 0 skip / exit 1 build, based on
#                                           turbo's real dependency graph compared
#                                           against the last SUCCESSFUL deploy.
#
# Why a manual i18n guard before turbo-ignore?
# ----------------------------------------------
# The web app loads its locale message files by RELATIVE PATH at runtime:
#     apps/web/i18n/request.ts:
#         import(`../../../packages/i18n/web/${locale}/common.json`)
#         import(`../../../packages/i18n/shared/${locale}.json`)
# It does NOT list `@agent-runway/i18n` in apps/web/package.json. Therefore
# `packages/i18n` is NOT part of turbo's dependency graph for `agentrunway-web`
# (verified: `turbo build --filter=agentrunway-web --dry=json` traces only
# `@agent-runway/core`). Left to turbo-ignore alone, a commit that only changes
# packages/i18n/web/** or packages/i18n/shared/** would be SKIPPED, shipping
# STALE locale content to production. The guard below forces a build in exactly
# that case. (packages/i18n/mobile/** is web-irrelevant and is intentionally
# NOT a build trigger.)
#
# This is strictly MORE conservative than turbo-ignore alone: it can only ever
# turn a skip into a build, never the reverse. A false skip on a real web change
# is worse than the cost it saves, so every ambiguous path resolves to build.
#
# Env vars Vercel provides:
#   VERCEL_GIT_COMMIT_REF     branch name
#   VERCEL_GIT_PREVIOUS_SHA   last successfully-deployed sha (may be empty)
# -----------------------------------------------------------------------------

set -uo pipefail

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-}"

log() { echo "[vercel-ignore] $*"; }

# 1. main always builds — production must never skip.
if [[ "$BRANCH" == "main" ]]; then
  log "branch=main -> BUILD (production never skips)"
  exit 1
fi

# Vercel runs this with cwd = apps/web (the project root in vercel.json).
# Resolve repo root so git diff paths are repo-relative.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

# 2. Out-of-graph i18n safety guard.
# Only meaningful if we can resolve a previous deploy sha AND the repo root.
# If we cannot, we do NOT skip here — we fall through to turbo-ignore, which
# itself falls back to BUILD when it cannot compare (see --fallback below).
if [[ -n "$PREV_SHA" && -n "$REPO_ROOT" ]]; then
  CHANGED="$(git -C "$REPO_ROOT" diff --name-only "$PREV_SHA" HEAD 2>/dev/null || true)"
  if [[ -n "$CHANGED" ]]; then
    if echo "$CHANGED" | grep -Eq '^packages/i18n/(web|shared)/'; then
      log "i18n web/shared locale files changed (relative-imported by web) -> BUILD"
      exit 1
    fi
  fi
fi

# 3. Delegate to turbo-ignore for the real dependency-graph comparison.
# -----------------------------------------------------------------------------
#   `turbo-ignore <workspace>`:
#     * compares HEAD against the last SUCCESSFUL Vercel deploy
#       (VERCEL_GIT_PREVIOUS_SHA), not merely the previous commit;
#     * exits 0 (skip) only when neither the workspace nor any package in its
#       turbo dependency graph changed;
#     * exits 1 (build) otherwise.
#   `--fallback=HEAD~1`:
#     * when no previous successful-deploy sha is available (first deploy on a
#       branch, history rewrite, etc.) turbo-ignore compares against HEAD~1
#       rather than defaulting to skip — conservative.
#
# `agentrunway-web` is the workspace name in apps/web/package.json ("name").
# turbo-ignore exits 0 to skip / 1 to build, which matches Vercel's contract,
# so we exec it directly as the final word.
# -----------------------------------------------------------------------------
log "delegating to turbo-ignore agentrunway-web (compares vs last successful deploy)"
exec npx --yes turbo-ignore agentrunway-web --fallback=HEAD~1
