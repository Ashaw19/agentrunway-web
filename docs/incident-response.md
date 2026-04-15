# Incident-Response Runbook

**Owner:** Andrew Shaw
**Last reviewed:** 2026-04-15
**Review cadence:** every 6 months, and after every real incident

---

## 1. Purpose

This runbook is what you follow when something has gone wrong with Agent Runway and user data, service availability, or the integrity of the platform may be at risk. It is deliberately short and actionable — there is no scenario where the right response is "read 50 pages of policy."

If you are reading this in the middle of an incident: go straight to **Section 4 — The Playbook**.

---

## 2. Roles

At the current founder-stage, one person fills every role. As the team grows, these roles split up.

| Role | Holder | Responsibilities |
|------|--------|------------------|
| **Incident Commander (IC)** | Andrew Shaw | Owns the response from detection to post-mortem. Makes the call on severity, containment, and user notification. |
| **Communications Lead** | Andrew Shaw | Drafts and sends the user + regulator notices. Handles inbound questions. |
| **Technical Lead** | Andrew Shaw | Investigates root cause, executes containment and recovery actions. |

**Emergency contacts** (fill in real numbers before lawyer hands over insurance docs):

- Supabase support: via dashboard ticket + `support@supabase.com`
- Vercel support: via dashboard ticket (priority tier required for phone)
- Stripe support: via dashboard + `+1-888-926-2289`
- Legal counsel: *[fill in lawyer name + phone]*
- Cyber-liability insurer breach hotline: *[fill in after policy issued]*
- Office of the Privacy Commissioner of Canada: `1-800-282-1376`

---

## 3. Severity

Pick a severity the moment you confirm something is wrong. The severity drives the timeline and who needs to be told.

| Severity | Definition | Examples | Response target |
|----------|------------|----------|-----------------|
| **SEV-1 — Critical** | Confirmed unauthorized access to user data, or full outage > 30 min, or data loss. | Database breach, production database corruption, credential leak with signs of use. | Begin response within **15 min** of detection. Notify affected users within **72 hours** of confirmation. Notify the OPC as soon as feasible. |
| **SEV-2 — High** | Suspected but unconfirmed breach, partial outage, or security misconfiguration with user-data exposure risk. | Exposed env var discovered, unusual auth pattern, single customer's data visible to another customer due to a bug. | Begin response within **1 hour**. Fix within 24 hours. User notification only if confirmed to SEV-1. |
| **SEV-3 — Moderate** | Bug with no user-data exposure, degraded feature, minor outage, elevated error rate. | Sentry spike, third-party dependency outage, non-critical endpoint returning 500s. | Begin response within **1 business day**. No external notification required. |
| **SEV-4 — Low** | Cosmetic, non-urgent, or security hygiene finding with no immediate exposure. | Dependabot security update available, secrets-scan false positive, user-agent bot hammering a public endpoint. | Batch with normal work. Track in issues. |

**Default up, not down.** If you are unsure between SEV-1 and SEV-2, treat it as SEV-1 until proven otherwise. It is cheaper to stand down than it is to escalate late.

---

## 4. The Playbook

### 4.1 — Detect

Real signals that should trigger this runbook:

- Sentry error spike (error rate > 5× baseline for > 5 min)
- User report of seeing another user's data
- Supabase dashboard showing abnormal query patterns or connection spikes
- Stripe webhook failures en masse
- Vercel deploy failures across multiple commits
- Any email or message claiming "I think I found a security issue"
- A dependency with a critical CVE (Dependabot severity: high/critical)
- Any unplanned write to a production credential / env var

When one of the above happens, **open a new incident log** (a dated markdown file in `/docs/incidents/YYYY-MM-DD-short-name.md`). Everything from here on gets written into that file as it happens. It is your single source of truth for the post-mortem.

### 4.2 — Assess (within 15 min for SEV-1)

Answer these three questions in the incident log before doing anything else:

1. **What systems are affected?** Database, auth, payments, MCP server, mobile, email, or multiple?
2. **Is user data at risk of being read, modified, or exfiltrated by an unauthorized party?** If yes or unsure, treat as SEV-1.
3. **How did we learn about it?** (Sentry, user report, security researcher, accidental discovery.)

### 4.3 — Contain

The goal of containment is to stop the bleed without destroying evidence. In this order:

1. **Preserve logs.** Do not restart services yet. Vercel and Supabase both retain logs, but restarting can rotate caches. Export the last hour of logs first.
2. **Revoke active credentials** that could be involved:
   - Rotate `SUPABASE_SERVICE_ROLE_KEY` in the Supabase dashboard
   - Rotate `STRIPE_SECRET_KEY` from Stripe dashboard
   - Rotate `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` from their respective dashboards
   - Rotate `OAUTH_SIGNING_KEY` (when OAuth ships)
3. **Kill active sessions.** In Supabase dashboard → Authentication → Users → select affected users → sign out all sessions. For a confirmed breach, kill all sessions, not just the affected users.
4. **Lock down write paths.** If a specific API route is implicated, disable it via a Vercel rollback to a known-good deploy *before* the bad commit, then push a feature-flag fix.
5. **Do not delete evidence.** Don't `git push --force`, don't wipe Sentry events, don't truncate logs. If the cause is a committed secret, it's already public — rotating is what matters, not hiding the commit.

### 4.4 — Eradicate

Once the bleed has stopped:

1. **Find the root cause.** Read the relevant code path end-to-end. Check git blame on the commit that shipped the bug. Re-run the exact request that caused the issue in a dev environment.
2. **Write the fix.** Include a test that would have caught the original bug.
3. **Ship the fix.** Normal commit + push. Verify the deploy goes green on Vercel.

### 4.5 — Recover

1. **Verify the fix in production.** Reproduce the original failing condition and confirm it now passes.
2. **Re-enable any disabled routes** or feature flags.
3. **Update the incident log** with the fix commit hash and deploy URL.

### 4.6 — Notify users (SEV-1 only)

Canadian privacy law requires notification of affected individuals and the Office of the Privacy Commissioner of Canada when a breach creates a "real risk of significant harm" (RROSH). Default assumption: **any unauthorized access to real-estate client contact info, financial data, or communications content meets RROSH.**

**Timeline:** within **72 hours of confirmation**, or sooner if legally required.

**Required elements of the notice** (PIPEDA s. 10.1 + Law 25 for Quebec users):

- What happened, in plain language
- What information was affected (categories, not values)
- When it happened and when we discovered it
- What we have done to contain it
- What the user should do (e.g., reset password, monitor for phishing)
- How to reach us with questions (dedicated response email)
- Reference to the incident ID from the log

**Template lives in:** `/docs/templates/breach-notification.md` *(create when the first incident happens — avoid pre-templating in a way that makes it easy to send a bad notice quickly)*

**Who else to notify:**

- **Office of the Privacy Commissioner of Canada** — breach reporting form at `priv.gc.ca`
- **Cyber-liability insurance carrier** — call the hotline on the policy before any public notification; they usually want to coordinate with external counsel
- **Legal counsel** — before sending the notice, every time, no exceptions
- **Commission d'accès à l'information du Québec** — only if Quebec-based users are affected (currently geo-blocked, so likely not applicable for now)

### 4.7 — Post-mortem (within 1 week of recovery)

Required for every SEV-1, SEV-2, and any customer-visible SEV-3. Not required for SEV-4.

The post-mortem is added to the incident log and reviewed with any team members. It must include:

1. **Timeline.** Everything that happened, with timestamps, from detection to recovery.
2. **Root cause.** Not "a bug," but the deeper "why was this bug possible" — the missing test, the missing review, the misleading doc, the process gap.
3. **What went well.** Always at least one thing. This is what you keep.
4. **What went poorly.** Honest. No blame on individuals.
5. **Action items.** Every action item has an owner and a due date. If an item doesn't have both, it's not an action item.
6. **Prevention.** What code, process, or alert would keep this from happening again? File the work.

A good post-mortem ends with a list of concrete, dated changes. A bad post-mortem ends with "we'll be more careful."

---

## 5. Preparedness

These are the things we maintain *before* an incident so the response is fast.

- [x] Sentry capturing errors from browser + Node + Edge runtimes
- [x] PII scrubbing on every Sentry event (defense-in-depth)
- [x] Server code hygiene: no emails, phones, or names in `console.log`
- [x] Row Level Security on every user-scoped table in Supabase
- [x] CSP + HSTS + clickjacking protection on every route
- [x] Rate limiting on public API routes
- [x] Dependabot running weekly, security updates immediate
- [x] GitHub secret scanning enabled on the repository
- [x] `security.txt` at `/.well-known/security.txt`
- [ ] Cyber-liability insurance in force (pending incorporation)
- [ ] Incident-response tabletop exercise (run annually, last run: never — do this once the company has a second person)

### Backups

**Production is on Supabase Free, which provides NO automated backups and NO point-in-time recovery.** Until that changes, the only safety net is the manual dump procedure in §8 below. Decision pending: upgrade to Pro ($25/mo) for daily automated backups + 7-day retention, or stay on Free with weekly manual dumps.

- [ ] Run `scripts/db/dump-production.sh` weekly (last run: never)
- [ ] Run a restore drill on a fresh project quarterly (last run: never — do this)
- [ ] Decide on Pro plan upgrade for automated backups (pending user decision)

---

## 6. After the first real incident

After the first real SEV-1 or SEV-2 incident this runbook gets rewritten based on what was learned. A runbook that survives unchanged through an incident is a runbook that wasn't followed.

---

## 7. Change log

| Date | Change | Reviewer |
|------|--------|----------|
| 2026-04-15 | Initial version | Andrew Shaw |
| 2026-04-15 | Added §8 backup + restore procedure; flagged Free-plan backup gap | Andrew Shaw |

---

## 8. Backup + restore procedure

### Take a manual backup

```bash
./scripts/db/dump-production.sh
```

This writes `backups/<timestamp>/` containing `schema.sql`, `data.sql`, `roles.sql`, and `manifest.json`. The `backups/` directory is gitignored — these dumps contain user PII and **must never be committed**. After running, copy the directory to encrypted off-machine storage (cloud drive, external disk).

### Restore to a fresh Supabase project (recovery drill or real recovery)

1. Create a new Supabase project in the same region (`ca-central-1`) via the dashboard.
2. Link the local CLI to the new project: `cd apps/web && npx supabase link --project-ref <new-ref>`.
3. Apply roles first: `npx supabase db push --linked --include-all` then `psql "$NEW_DB_URL" -f backups/<ts>/roles.sql`.
4. Apply schema: `psql "$NEW_DB_URL" -f backups/<ts>/schema.sql`.
5. Apply data: `psql "$NEW_DB_URL" -f backups/<ts>/data.sql`.
6. Spot-check a handful of user records via `npx supabase db query` to verify integrity.
7. Update `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel to point at the new project.
8. Redeploy. Verify users can sign in and dashboard loads.

### Once on Pro

Pro plan provides one-click PITR restore via the dashboard. The manual procedure above becomes a fallback rather than the primary recovery path, but `dump-production.sh` is still useful for off-cloud copies before risky migrations.
