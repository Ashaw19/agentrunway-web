# Vercel Build Cost — what's in-repo, what's Andrew's dashboard click

Vercel Pro bills **Build CPU Minutes**. Two cost drivers were identified:
1. Builds fire even when no web code changed (memory/, docs/, `apps/mobile/**`).
2. Each build is ~4 min and installs the whole monorepo (including the Expo tree).

This doc records the fixes and the one piece that lives in the Vercel dashboard.

---

## Lever 1 — Skip builds when the web app didn't change

**Mechanism (in-repo, reviewable):** `apps/web/vercel.json` → `"ignoreCommand": "bash scripts/vercel-ignore.sh"`.

The script (`apps/web/scripts/vercel-ignore.sh`) decides skip vs build:

1. `main` branch → **always BUILD** (production never skips).
2. Changed files under `packages/i18n/web/**` or `packages/i18n/shared/**` →
   **BUILD**. These locale JSON files are loaded by the web app via a *relative*
   `import()` in `apps/web/i18n/request.ts`, so they are **not** in turbo's
   dependency graph for `agentrunway-web`. Without this guard a locale-only edit
   would be wrongly skipped and ship stale translations.
3. Otherwise delegate to **`turbo-ignore agentrunway-web --fallback=HEAD~1`**,
   which skips (exit 0) only when neither `agentrunway-web` nor any package in
   its turbo dependency graph (`@agent-runway/core`) changed **since the last
   successful deploy**, and builds (exit 1) otherwise.

**Safety direction:** the only deviations from turbo-ignore are toward *more*
building (main, i18n guard). A real web change always builds. A false skip is
worse than the cost it saves, so every ambiguous case resolves to build.

Verified locally (no Vercel deploy spent):
- web code change (PR #193 `0cfe8ca`) → BUILD ✓
- `apps/web` + `packages/core` change (PR #186 `b0caf6d`) → BUILD ✓
- mobile-only change (`8d70ecf`, only `apps/mobile/lib/theme.ts`) → SKIP ✓
- mobile + `packages/i18n/mobile/**` (`f50fb9c`) → SKIP ✓
- synthetic `packages/i18n/shared/en.json` edit → turbo-ignore *alone* would
  SKIP (blind spot), guard forces BUILD ✓
- any change on `main` → BUILD ✓

**No dashboard change required for Lever 1** — `ignoreCommand` is read from the
committed `vercel.json`.

---

## Lever 2 — Why ~4 min, and what was (and wasn't) changed

The ~4 min is the cold `next build` itself (15+ statically-generated SEO pages
plus heavy client deps: onnxruntime-web, @react-pdf, pdfjs). Locally turbo's
build cache saves ~2.5 min on a warm hit — but that cache **does not apply on
Vercel** today, because:
- the Vercel `buildCommand` runs `next build` directly (not through turbo), and
- Vercel does not persist turbo's `.turbo` cache across deploys.

**Applied (in-repo, correctness-preserving):**
- `installCommand` scoped to `pnpm install --frozen-lockfile --filter agentrunway-web...`
  → installs only `agentrunway-web` + `@agent-runway/core`, **skipping the Expo
  (`apps/mobile`) dependency tree**. Verified the filter selects exactly those
  two packages ("Scope: 2 of 5 workspace projects") and the web build is green.
  `--frozen-lockfile` is preserved (no lockfile drift).

**NOT changed (deliberately):**
- The `buildCommand` was left as `pnpm build` (`next build`). Routing it through
  turbo yields **zero speedup until Turbo Remote Cache is enabled**, and adds
  risk for no current gain. It pairs with the Remote Cache follow-up below.

### Follow-up that needs Andrew (token / dashboard) — NOT done here

**Turbo Remote Cache** is the real cross-deploy build-cache win (cold ~4 min →
warm cache restore in seconds when inputs are unchanged). It requires secrets,
so it is flagged, not applied:

1. Create a Vercel/Turbo Remote Cache token and team slug.
2. Add to the `agentrunway-web` project env (Production + Preview):
   `TURBO_TOKEN`, `TURBO_TEAM`.
3. Change `buildCommand` to
   `cd ../.. && pnpm turbo build --filter=agentrunway-web`
   (so the build runs through turbo and consults remote cache).

Until those env vars exist, leave `buildCommand` as-is — turbo-through-Vercel
without remote cache is a cold cache every build (no benefit).

---

## Dashboard settings that remain Andrew's (no agent write access)

The `ignoreCommand` in `vercel.json` takes precedence, but confirm the project's
**Settings → Git → Ignored Build Step** is NOT also set to a conflicting custom
command (a UI value can shadow intent). The committed `vercel.json` is the source
of truth; the dashboard field can be left on its default ("Automatic").
