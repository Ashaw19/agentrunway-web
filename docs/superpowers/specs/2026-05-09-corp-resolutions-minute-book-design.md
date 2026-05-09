# Design: Corporate Resolutions + Minute Book (Build #13)

**Date:** 2026-05-09  
**Build:** Phase 3 Build #13  
**Status:** Approved by Andrew Shaw (delegated execution)

---

## Purpose

Enable Andrew, as sole director of Agent Runway Inc. (CCPC), to create, store, and retrieve
board resolutions directly within the Director Cockpit — without drafting them in a separate
word processor. Resolutions are the legal record of director-level decisions (salary elections,
dividend declarations, officer appointments, etc.) and must be maintained in the minute book.

---

## What Is NOT in Scope

- E-signature integration (sign on screen) — out of scope; print + wet signature is fine for a
  single-director CCPC
- Shareholder register or share ledger — separate concern, not blocking
- Automatic reminders to pass annual resolutions — compliance calendar already handles this

---

## Schema (migration 00147)

```sql
CREATE TABLE corp_resolutions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolution_number TEXT        NOT NULL,          -- e.g. "2026-DR-001", assigned by trigger
  resolution_type   TEXT        NOT NULL CHECK (resolution_type IN (
                                  'salary_election', 'dividend_declaration',
                                  'banking_authority', 'officer_appointment',
                                  'agm_waiver', 'general'
                                )),
  subject           TEXT        NOT NULL,
  body_md           TEXT        NOT NULL,
  passed_date       DATE        NOT NULL,
  fiscal_year       INTEGER     NOT NULL GENERATED ALWAYS AS (EXTRACT(YEAR FROM passed_date)::INTEGER) STORED,
  status            TEXT        NOT NULL DEFAULT 'passed'
                                CHECK (status IN ('draft', 'passed')),
  is_unanimous      BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Auto-numbering: a `BEFORE INSERT` trigger assigns `resolution_number` as `{year}-DR-{NNN}`
where NNN is zero-padded to 3 digits and increments per fiscal year per user.

RLS: `cockpit_has_access()` on SELECT/INSERT/UPDATE/DELETE (same pattern as all other corp_*
tables). `user_id = auth.uid()` check on INSERT.

---

## TypeScript Types

Added to `packages/core/types/database.ts`:

```typescript
export type CorpResolutionType =
  | 'salary_election' | 'dividend_declaration' | 'banking_authority'
  | 'officer_appointment' | 'agm_waiver' | 'general';

export type CorpResolutionStatus = 'draft' | 'passed';

export interface CorpResolution {
  id: string;
  user_id: string;
  resolution_number: string;
  resolution_type: CorpResolutionType;
  subject: string;
  body_md: string;
  passed_date: string;
  fiscal_year: number;
  status: CorpResolutionStatus;
  is_unanimous: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## API Routes

### `POST /api/cockpit/resolutions`
Creates a new resolution. Body: `{ resolution_type, subject, body_md, passed_date, status }`.
Returns the created `CorpResolution`. Allowlisted to `ALLOWED_EMAILS`.

### `PATCH /api/cockpit/resolutions/[id]`
Updates subject, body_md, status of an existing resolution. Returns updated record.

### `DELETE /api/cockpit/resolutions/[id]`
Deletes a resolution by ID. Only allowed if `status = 'draft'` (passed resolutions are
immutable once passed — changing history is not allowed). Hard-coded guard in the route.

---

## UI — `/cockpit/resolutions`

### Page layout

```
┌─ Resolutions ──────────────────────────────── [+ New resolution] ─┐
│                                                                     │
│  FY2026                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2026-DR-001 · Salary Election · passed   May 9 2026  [···]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  No draft resolutions.                                              │
└─────────────────────────────────────────────────────────────────────┘
```

- Grouped by fiscal year, descending
- Each row: `resolution_number`, type badge (color-coded), subject (truncated), `passed_date`,
  status pill (draft = amber, passed = emerald), kebab menu (Edit / Print / Delete)
- Click row → opens detail modal with full `body_md` rendered, Print button, Edit (if draft)

### New Resolution modal

1. **Template picker** — 6 cards (salary election, dividend, AGM waiver, banking, officer,
   general). Selecting one pre-populates subject + body_md.
2. **Subject** — editable text field
3. **Body** — `<textarea>` (monospace, 16 rows). Markdown rendered in detail view.
4. **Passed date** — date picker, defaults to today
5. **Status** — toggle: Draft / Passed (default: Passed for new resolutions)
6. **Submit** → POST → optimistic prepend to list

### Print view

A `<div id="resolution-print">` with print-specific CSS (`@media print`): AR Inc. letterhead
stub, resolution number + date, body, signature line. Browser's `window.print()` triggered by
"Print" button. No PDF generation dependency needed.

---

## Resolution Templates (6)

All templates use `{year}` and `{date}` as fill-in placeholders shown as `_______`.

1. **Salary election** — authorized salary per annum, effective date, signing-officer authorization
2. **Dividend declaration** — amount per Class A share, record date, payment date
3. **AGM waiver (annual resolution in lieu)** — financial statement approval, director election, auditor waiver
4. **Banking authority** — sole signing officer (Andrew Shaw), standing until revoked
5. **Officer appointment** — President + Secretary (both Andrew Shaw)
6. **General** — blank free-form

---

## Director Persona Tool

Add `listResolutions` tool to `/api/cockpit/director-chat/route.ts`:

```typescript
listResolutions: tool({
  description: "Read passed corporate resolutions for a fiscal year. Useful when Andrew asks
    what resolutions have been passed, whether a salary election exists, or what the current
    director compensation authorization says.",
  inputSchema: z.object({
    year: z.number().int().optional(),
    resolution_type: z.enum([...]).optional(),
  }),
  execute: async ({ year, resolution_type }) => { ... }
})
```

---

## Export Bundle Integration

`apps/web/lib/cockpit/export-bundle.ts`: add a `resolutions/` folder to the ZIP. Each
resolution exported as `{resolution_number}_{subject_slug}.md` (markdown). The README.txt
updated to mention the resolutions folder.

---

## Cockpit Nav

Add "Resolutions" link (Gavel icon from lucide-react) to the cockpit sidebar, between
"Documents" and "Compliance" (alphabetical / logical governance grouping).

---

## Snapshot Page

No new Snapshot card — the compliance calendar already has a "minute book update" event.
Snapshot stays clean.

---

## Migration Number

`00147_corp_resolutions.sql` (00145 = workflow templates, 00146 = client communication log,
00147 = corp resolutions).

---

## Test Plan

1. `pnpm turbo test` — full suite green before push
2. TypeScript: `cd apps/web && npx tsc --noEmit` — zero errors
3. Manual: create a salary election resolution from template, verify auto-number is "2026-DR-001",
   verify it appears in list, verify print modal renders signature line, verify delete is blocked
   for passed resolution
4. Export bundle: generate ZIP, confirm `resolutions/2026-DR-001_*.md` appears inside
5. Director chat: ask "what resolutions have I passed?", confirm `listResolutions` tool fires
   and returns the salary election
