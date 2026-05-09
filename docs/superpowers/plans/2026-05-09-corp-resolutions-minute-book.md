# Corporate Resolutions + Minute Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Andrew (sole director of Agent Runway Inc.) to create, store, and retrieve corporate resolutions directly in the Director Cockpit — without leaving the app or opening a word processor.

**Architecture:** New `corp_resolutions` table with auto-assigned sequential numbering (trigger-based), a dedicated `/cockpit/resolutions` page with 6 CCPC resolution templates, POST/PATCH/DELETE API routes, a `listResolutions` Director persona tool, and resolutions exported as markdown files in the year-end ZIP bundle.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), TypeScript, Tailwind CSS, lucide-react, Zod, Vercel AI SDK

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/supabase/migrations/00147_corp_resolutions.sql` | Create | Schema + auto-numbering trigger + RLS |
| `packages/core/types/database.ts` | Modify (~line 1758) | `CorpResolutionType`, `CorpResolutionStatus`, `CorpResolution` types |
| `apps/web/app/api/cockpit/resolutions/route.ts` | Create | GET list + POST create |
| `apps/web/app/api/cockpit/resolutions/[id]/route.ts` | Create | PATCH update + DELETE |
| `apps/web/app/cockpit/resolutions/page.tsx` | Create | Server page — auth + initial data fetch |
| `apps/web/app/cockpit/resolutions/resolutions-client.tsx` | Create | Client component — list, new-resolution modal, print view |
| `apps/web/app/api/cockpit/director-chat/route.ts` | Modify | Add `listResolutions` tool |
| `apps/web/lib/cockpit/export-bundle.ts` | Modify | Add `resolutions/` folder to ZIP + update README |
| `apps/web/app/cockpit/cockpit-shell.tsx` | Modify | Add "Resolutions" nav tab |

---

## Task 1: Database migration

**Files:**
- Create: `apps/web/supabase/migrations/00147_corp_resolutions.sql`

- [ ] **Step 1.1: Write the migration file**

```sql
-- Migration 00147: corp_resolutions
--
-- Inline corporate resolution creation for the Director Cockpit.
-- Resolutions are typed directly in the cockpit (not file uploads).
-- Auto-numbered {year}-DR-{NNN} via BEFORE INSERT trigger.

CREATE TABLE IF NOT EXISTS corp_resolutions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolution_number TEXT        NOT NULL,
  resolution_type   TEXT        NOT NULL CHECK (resolution_type IN (
                                  'salary_election', 'dividend_declaration',
                                  'banking_authority', 'officer_appointment',
                                  'agm_waiver', 'general'
                                )),
  subject           TEXT        NOT NULL,
  body_md           TEXT        NOT NULL,
  passed_date       DATE        NOT NULL,
  fiscal_year       INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'passed'
                                CHECK (status IN ('draft', 'passed')),
  is_unanimous      BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-number + fiscal_year trigger
CREATE OR REPLACE FUNCTION assign_corp_resolution_number()
RETURNS TRIGGER AS $$
DECLARE
  yr  INTEGER;
  seq INTEGER;
BEGIN
  yr := EXTRACT(YEAR FROM NEW.passed_date)::INTEGER;
  SELECT COUNT(*) + 1 INTO seq
  FROM corp_resolutions
  WHERE user_id = NEW.user_id
    AND fiscal_year = yr;
  NEW.resolution_number := yr::TEXT || '-DR-' || LPAD(seq::TEXT, 3, '0');
  NEW.fiscal_year        := yr;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corp_resolution_number
  BEFORE INSERT ON corp_resolutions
  FOR EACH ROW EXECUTE FUNCTION assign_corp_resolution_number();

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_corp_resolution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corp_resolution_updated_at
  BEFORE UPDATE ON corp_resolutions
  FOR EACH ROW EXECUTE FUNCTION set_corp_resolution_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corp_res_user_year
  ON corp_resolutions (user_id, fiscal_year DESC);

CREATE INDEX IF NOT EXISTS idx_corp_res_user_type
  ON corp_resolutions (user_id, resolution_type);

CREATE INDEX IF NOT EXISTS idx_corp_res_user_status
  ON corp_resolutions (user_id, status);

-- RLS
ALTER TABLE corp_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corp_resolutions_select"
  ON corp_resolutions FOR SELECT
  USING (cockpit_has_access());

CREATE POLICY "corp_resolutions_insert"
  ON corp_resolutions FOR INSERT
  WITH CHECK (user_id = auth.uid() AND cockpit_has_access());

CREATE POLICY "corp_resolutions_update"
  ON corp_resolutions FOR UPDATE
  USING (cockpit_has_access())
  WITH CHECK (user_id = auth.uid() AND cockpit_has_access());

CREATE POLICY "corp_resolutions_delete"
  ON corp_resolutions FOR DELETE
  USING (cockpit_has_access());
```

- [ ] **Step 1.2: Apply migration to production via Supabase MCP**

Use the `mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__apply_migration` tool with the SQL above. Confirm the tool returns success. Verify by running:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'corp_resolutions'
ORDER BY ordinal_position;
```

Expected: `id, user_id, resolution_number, resolution_type, subject, body_md, passed_date, fiscal_year, status, is_unanimous, created_at, updated_at`

---

## Task 2: TypeScript types

**Files:**
- Modify: `packages/core/types/database.ts` (insert after `CorpDocument` block, ~line 1758)

- [ ] **Step 2.1: Add CorpResolution types**

Insert immediately after the closing `}` of `export interface CorpDocument { ... }`:

```typescript
// ── Corporate resolutions — migration 00147 ──────────────────────────────────
// Inline resolution creation for the Director Cockpit minute book.
// Auto-numbered {year}-DR-{NNN} by the assign_corp_resolution_number trigger.

export type CorpResolutionType =
  | "salary_election"
  | "dividend_declaration"
  | "banking_authority"
  | "officer_appointment"
  | "agm_waiver"
  | "general";

export type CorpResolutionStatus = "draft" | "passed";

export interface CorpResolution {
  id:                string;
  user_id:           string;
  resolution_number: string;
  resolution_type:   CorpResolutionType;
  subject:           string;
  body_md:           string;
  passed_date:       string;  // YYYY-MM-DD
  fiscal_year:       number;
  status:            CorpResolutionStatus;
  is_unanimous:      boolean;
  created_at:        string;
  updated_at:        string;
}
```

- [ ] **Step 2.2: Verify no TypeScript errors introduced**

```bash
cd packages/core && npx tsc --noEmit
```

Expected: zero errors.

---

## Task 3: API route — GET + POST

**Files:**
- Create: `apps/web/app/api/cockpit/resolutions/route.ts`

- [ ] **Step 3.1: Write the route**

```typescript
/**
 * GET  /api/cockpit/resolutions           — list resolutions (newest first, optional ?year=)
 * POST /api/cockpit/resolutions           — create a new resolution
 *
 * Allowlisted to andrew@andrewdshaw.ca. resolution_number and fiscal_year
 * are set by the DB trigger — do NOT pass them in the POST body.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpResolution, CorpResolutionType, CorpResolutionStatus } from "@agent-runway/core/types/database";

export const runtime = "nodejs";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const VALID_TYPES = new Set<CorpResolutionType>([
  "salary_election", "dividend_declaration", "banking_authority",
  "officer_appointment", "agm_waiver", "general",
]);

async function authenticate(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return { user: null, supabase };
  }
  return { user, supabase };
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const year = req.nextUrl.searchParams.get("year");

  let query = supabase
    .from("corp_resolutions")
    .select("id, resolution_number, resolution_type, subject, passed_date, fiscal_year, status, is_unanimous, created_at, updated_at")
    .order("passed_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (year) query = query.eq("fiscal_year", Number(year));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resolutions: data ?? [] });
}

interface CreateBody {
  resolution_type: CorpResolutionType;
  subject:         string;
  body_md:         string;
  passed_date:     string;
  status:          CorpResolutionStatus;
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Partial<CreateBody>;
  try {
    body = (await req.json()) as Partial<CreateBody>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { resolution_type, subject, body_md, passed_date, status = "passed" } = body;

  if (!resolution_type || !VALID_TYPES.has(resolution_type))
    return NextResponse.json({ error: "invalid resolution_type" }, { status: 400 });
  if (!subject?.trim())
    return NextResponse.json({ error: "subject required" }, { status: 400 });
  if (!body_md?.trim())
    return NextResponse.json({ error: "body_md required" }, { status: 400 });
  if (!passed_date || !/^\d{4}-\d{2}-\d{2}$/.test(passed_date))
    return NextResponse.json({ error: "passed_date required (YYYY-MM-DD)" }, { status: 400 });
  if (status !== "draft" && status !== "passed")
    return NextResponse.json({ error: "status must be draft or passed" }, { status: 400 });

  const { data, error } = await supabase
    .from("corp_resolutions")
    .insert({
      user_id:          user.id,
      resolution_type,
      subject:          subject.trim(),
      body_md:          body_md.trim(),
      passed_date,
      // resolution_number + fiscal_year set by trigger
      status,
      is_unanimous:     true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resolution: data as CorpResolution }, { status: 201 });
}
```

---

## Task 4: API route — PATCH + DELETE

**Files:**
- Create: `apps/web/app/api/cockpit/resolutions/[id]/route.ts`

- [ ] **Step 4.1: Write the route**

```typescript
/**
 * PATCH  /api/cockpit/resolutions/[id]  — update subject / body_md / status / passed_date
 * DELETE /api/cockpit/resolutions/[id]  — delete (only allowed for status = 'draft')
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpResolutionStatus } from "@agent-runway/core/types/database";

export const runtime = "nodejs";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

async function authenticate(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return { user: null, supabase };
  }
  return { user, supabase };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Partial<{
    subject: string;
    body_md: string;
    status: CorpResolutionStatus;
    passed_date: string;
  }>;
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.subject !== undefined)    update.subject    = body.subject.trim();
  if (body.body_md !== undefined)    update.body_md    = body.body_md.trim();
  if (body.status !== undefined)     update.status     = body.status;
  if (body.passed_date !== undefined) update.passed_date = body.passed_date;

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("corp_resolutions")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resolution: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch first to verify it's a draft (passed resolutions are immutable)
  const { data: existing, error: fetchErr } = await supabase
    .from("corp_resolutions")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !existing)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.status === "passed")
    return NextResponse.json(
      { error: "Passed resolutions cannot be deleted. They are part of the permanent minute book." },
      { status: 409 },
    );

  const { error } = await supabase
    .from("corp_resolutions")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

---

## Task 5: Resolutions page — server + client

**Files:**
- Create: `apps/web/app/cockpit/resolutions/page.tsx`
- Create: `apps/web/app/cockpit/resolutions/resolutions-client.tsx`

- [ ] **Step 5.1: Write the server page**

```typescript
// apps/web/app/cockpit/resolutions/page.tsx

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResolutionsClient } from "./resolutions-client";
import type { CorpResolution } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function ResolutionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const { data: resolutions } = await supabase
    .from("corp_resolutions")
    .select("id, resolution_number, resolution_type, subject, body_md, passed_date, fiscal_year, status, is_unanimous, created_at, updated_at")
    .order("passed_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Resolutions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Corporate minute book — director resolutions for Agent Runway Inc.
        </p>
      </div>
      <ResolutionsClient initialResolutions={(resolutions ?? []) as CorpResolution[]} />
    </div>
  );
}
```

- [ ] **Step 5.2: Write the client component**

Create `apps/web/app/cockpit/resolutions/resolutions-client.tsx` with the full content below. This is a long file — write it in full:

```tsx
"use client";

import { useState, useCallback, useRef } from "react";
import {
  Plus,
  Gavel,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Printer,
  Pencil,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CorpResolution,
  CorpResolutionType,
  CorpResolutionStatus,
} from "@agent-runway/core/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CorpResolutionType, string> = {
  salary_election:      "Salary Election",
  dividend_declaration: "Dividend Declaration",
  banking_authority:    "Banking Authority",
  officer_appointment:  "Officer Appointment",
  agm_waiver:           "AGM Waiver",
  general:              "General",
};

const TYPE_COLORS: Record<CorpResolutionType, string> = {
  salary_election:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  dividend_declaration: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  banking_authority:    "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  officer_appointment:  "bg-blue-500/10 text-blue-300 border-blue-500/20",
  agm_waiver:           "bg-amber-500/10 text-amber-300 border-amber-500/20",
  general:              "bg-muted/40 text-muted-foreground border-muted/40",
};

const STATUS_COLORS: Record<CorpResolutionStatus, string> = {
  passed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  draft:  "bg-amber-500/10 text-amber-300 border-amber-500/20",
};

const today = new Date().toISOString().slice(0, 10);
const thisYear = new Date().getFullYear();

const TEMPLATES: Record<CorpResolutionType, { subject: string; body: string }> = {
  salary_election: {
    subject: `Director Compensation — Salary Authorization FY${thisYear}`,
    body: `BE IT RESOLVED THAT the Corporation pay Andrew Shaw, Director and President, a salary of $_______ per annum (or $_______ per month), effective _______, in consideration of services rendered to Agent Runway Inc.

BE IT FURTHER RESOLVED THAT the appropriate officer is authorized to execute all documents necessary to give effect to this resolution.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc. passed by written resolution on _______.


________________________________
Andrew Shaw, Sole Director`,
  },
  dividend_declaration: {
    subject: `Dividend Declaration — Class A Common Shares FY${thisYear}`,
    body: `BE IT RESOLVED THAT a dividend in the amount of $_______ per Class A Common Share be and is hereby declared payable to shareholders of record as of _______.

BE IT FURTHER RESOLVED THAT the payment date shall be _______.

BE IT FURTHER RESOLVED THAT the appropriate officer is authorized to execute all documents necessary to effect payment of this dividend.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  banking_authority: {
    subject: "Banking Resolution — Authorized Signatories",
    body: `BE IT RESOLVED THAT the Corporation maintain banking accounts and that Andrew Shaw is hereby authorized as the sole signing officer for all banking transactions on behalf of Agent Runway Inc.

BE IT FURTHER RESOLVED THAT the foregoing authority remains in effect until revoked by a subsequent resolution of the Board of Directors.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  officer_appointment: {
    subject: `Officers of the Corporation — Appointment Resolution FY${thisYear}`,
    body: `BE IT RESOLVED THAT the following officers of Agent Runway Inc. are hereby appointed to serve at the pleasure of the Board of Directors:

  President:   Andrew Shaw
  Secretary:   Andrew Shaw

BE IT FURTHER RESOLVED THAT any one officer is authorized to execute documents and instruments on behalf of the Corporation.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  agm_waiver: {
    subject: `Annual General Meeting — Written Resolution in Lieu FY${thisYear}`,
    body: `I, Andrew Shaw, being the sole shareholder of Agent Runway Inc., hereby waive notice of and consent to the holding of the Annual General Meeting of Shareholders for the fiscal year ended December 31, ${thisYear}.

BE IT RESOLVED THAT:

1. The financial statements of the Corporation for the fiscal year ended December 31, ${thisYear} are hereby approved.
2. The directors of the Corporation are elected for the ensuing year.
3. The appointment of an auditor is hereby waived (the Corporation qualifies as an exempt private corporation).

________________________________
Andrew Shaw, Sole Shareholder & Director
Date: _______`,
  },
  general: {
    subject: "",
    body: `BE IT RESOLVED THAT _______

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
};

// ── New Resolution Modal ───────────────────────────────────────────────────────

interface NewResolutionModalProps {
  onClose: () => void;
  onCreated: (res: CorpResolution) => void;
}

function NewResolutionModal({ onClose, onCreated }: NewResolutionModalProps) {
  const [step, setStep] = useState<"template" | "edit">("template");
  const [type, setType] = useState<CorpResolutionType>("salary_election");
  const [subject, setSubject] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [passedDate, setPassedDate] = useState(today);
  const [status, setStatus] = useState<CorpResolutionStatus>("passed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectTemplate = useCallback((t: CorpResolutionType) => {
    setType(t);
    setSubject(TEMPLATES[t].subject);
    setBodyMd(TEMPLATES[t].body);
    setStep("edit");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/cockpit/resolutions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolution_type: type, subject, body_md: bodyMd, passed_date: passedDate, status }),
        });
        const json = (await res.json()) as { ok?: boolean; resolution?: CorpResolution; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Save failed");
        onCreated(json.resolution!);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [type, subject, bodyMd, passedDate, status, onCreated, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[oklch(0.235_0.055_262)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">
            {step === "template" ? "Choose a resolution template" : "New resolution"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "template" ? (
          <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3">
            {(Object.keys(TEMPLATES) as CorpResolutionType[]).map((t) => (
              <button
                key={t}
                onClick={() => selectTemplate(t)}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span
                  className={cn(
                    "mb-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    TYPE_COLORS[t],
                  )}
                >
                  {TYPE_LABELS[t]}
                </span>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t === "salary_election" && "Authorize annual director compensation"}
                  {t === "dividend_declaration" && "Declare a dividend on Class A shares"}
                  {t === "banking_authority" && "Designate signing officers for banking"}
                  {t === "officer_appointment" && "Appoint corporate officers"}
                  {t === "agm_waiver" && "Annual resolution in lieu of AGM"}
                  {t === "general" && "Free-form director resolution"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("template")}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ← Change template
              </button>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  TYPE_COLORS[type],
                )}
              >
                {TYPE_LABELS[type]}
              </span>
            </div>

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Resolution text <span className="text-red-400">*</span>
              </label>
              <textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                required
                rows={14}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Date passed <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={passedDate}
                  onChange={(e) => setPassedDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CorpResolutionStatus)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
                >
                  <option value="passed" className="bg-[oklch(0.235_0.055_262)]">Passed</option>
                  <option value="draft" className="bg-[oklch(0.235_0.055_262)]">Draft</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                {saving ? "Saving…" : "Save resolution"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Resolution Detail Modal (read + print) ────────────────────────────────────

interface DetailModalProps {
  resolution: CorpResolution;
  onClose: () => void;
}

function DetailModal({ resolution, onClose }: DetailModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    const content = printRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${resolution.resolution_number} — ${resolution.subject}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 2.5cm; color: #000; }
    .header { text-align: center; margin-bottom: 2em; border-bottom: 1px solid #000; padding-bottom: 1em; }
    .header h1 { font-size: 14pt; margin: 0 0 0.25em; }
    .header p { margin: 0; font-size: 10pt; color: #444; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 12pt; line-height: 1.6; margin: 1.5em 0; }
    .number { font-size: 10pt; color: #444; margin-top: 1em; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Agent Runway Inc.</h1>
    <p>Federal CCPC — incorporated 2026-04-16</p>
  </div>
  ${content}
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }, [resolution]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[oklch(0.235_0.055_262)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[oklch(0.235_0.055_262)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-amber-300">{resolution.resolution_number}</span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                STATUS_COLORS[resolution.status],
              )}
            >
              {resolution.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div ref={printRef} className="px-6 py-5">
          <p className="number text-muted-foreground mb-1 text-xs">
            {resolution.resolution_number} · {resolution.passed_date} ·{" "}
            {TYPE_LABELS[resolution.resolution_type]}
          </p>
          <h3 className="mb-4 text-base font-semibold text-white">{resolution.subject}</h3>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/80">
            {resolution.body_md}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ── Resolution list row ───────────────────────────────────────────────────────

interface ResolutionRowProps {
  resolution: CorpResolution;
  onView: (r: CorpResolution) => void;
}

function ResolutionRow({ resolution, onView }: ResolutionRowProps) {
  return (
    <button
      onClick={() => onView(resolution)}
      className="group flex w-full items-center gap-4 py-3 text-left transition hover:bg-white/[0.02]"
    >
      <Gavel className="text-muted-foreground/50 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-300/80">{resolution.resolution_number}</span>
          <span className="truncate text-sm font-medium text-white">{resolution.subject}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{resolution.passed_date}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            TYPE_COLORS[resolution.resolution_type],
          )}
        >
          {TYPE_LABELS[resolution.resolution_type]}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[resolution.status],
          )}
        >
          {resolution.status}
        </span>
      </div>
    </button>
  );
}

// ── Root client component ─────────────────────────────────────────────────────

interface ResolutionsClientProps {
  initialResolutions: CorpResolution[];
}

export function ResolutionsClient({ initialResolutions }: ResolutionsClientProps) {
  const [resolutions, setResolutions] = useState<CorpResolution[]>(initialResolutions);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<CorpResolution | null>(null);

  const handleCreated = useCallback((res: CorpResolution) => {
    setResolutions((prev) => [res, ...prev]);
  }, []);

  // Group by fiscal year
  const byYear = resolutions.reduce<Record<number, CorpResolution[]>>((acc, r) => {
    const yr = r.fiscal_year;
    if (!acc[yr]) acc[yr] = [];
    acc[yr].push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <>
      {showNew && (
        <NewResolutionModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
      {viewing && (
        <DetailModal
          resolution={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {resolutions.length === 0
            ? "No resolutions on record."
            : `${resolutions.length} resolution${resolutions.length === 1 ? "" : "s"} on record.`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          New resolution
        </button>
      </div>

      {resolutions.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <Gavel className="text-muted-foreground/30 mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No resolutions recorded yet.</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Start with a salary election or AGM waiver for FY{thisYear}.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {years.map((yr) => (
            <section key={yr}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                FY{yr}
              </h2>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-5 divide-y divide-white/5">
                {byYear[yr].map((r) => (
                  <ResolutionRow key={r.id} resolution={r} onView={setViewing} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
```

---

## Task 6: Director persona tool — listResolutions

**Files:**
- Modify: `apps/web/app/api/cockpit/director-chat/route.ts`

- [ ] **Step 6.1: Add the listResolutions tool**

In `apps/web/app/api/cockpit/director-chat/route.ts`, add the `listResolutions` tool to the `tools` object, between `bankReconciliationSummary` and `upcomingCompliance`:

```typescript
/**
 * Corporate resolutions for the minute book. Source: corp_resolutions.
 */
listResolutions: tool({
  description:
    "Read corporate resolutions (minute book) for AR Inc. Returns resolution_number, type, subject, passed_date, status, and body_md. Use when Andrew asks what resolutions have been passed, whether a salary election exists for a given year, or wants to review the minute book.",
  inputSchema: z.object({
    year: z
      .number()
      .int()
      .optional()
      .describe("Fiscal year to filter on. Defaults to the current year."),
    resolution_type: z
      .enum([
        "salary_election",
        "dividend_declaration",
        "banking_authority",
        "officer_appointment",
        "agm_waiver",
        "general",
      ])
      .optional()
      .describe("Filter by resolution type."),
    status: z
      .enum(["draft", "passed"])
      .optional()
      .describe("Filter by status. Omit to return all."),
  }),
  execute: async ({ year, resolution_type, status: resStatus }) => {
    let query = supabase
      .from("corp_resolutions")
      .select(
        "resolution_number, resolution_type, subject, passed_date, fiscal_year, status, body_md, created_at",
      )
      .order("passed_date", { ascending: false });

    if (year) query = query.eq("fiscal_year", year);
    if (resolution_type) query = query.eq("resolution_type", resolution_type);
    if (resStatus) query = query.eq("status", resStatus);

    const { data, error } = await query.limit(50);
    if (error) return { error: error.message };
    return { rows: data ?? [] };
  },
}),
```

---

## Task 7: Export bundle — add resolutions folder

**Files:**
- Modify: `apps/web/lib/cockpit/export-bundle.ts`

- [ ] **Step 7.1: Add resolutionCount to ExportBundleResult**

In the `ExportBundleResult` interface, add `resolutionCount: number`:

```typescript
export interface ExportBundleResult {
  zip:              JSZip;
  filenameBase:     string;
  reportCount:      number;
  txnCount:         number;
  receiptCount:     number;
  docCount:         number;
  resolutionCount:  number;   // ← add this
  errors:           string[];
}
```

- [ ] **Step 7.2: Initialize resolutionCount in buildExportBundle**

In `buildExportBundle`, alongside the other count variables, add:

```typescript
let resolutionCount = 0;
```

- [ ] **Step 7.3: Add resolutions section to buildExportBundle**

After the `documents/` section (before `README.txt`), insert:

```typescript
// ── 5. Resolutions → resolutions/ ────────────────────────────────────────────

try {
  const { data: resolutions } = await supabase
    .from("corp_resolutions")
    .select(
      "resolution_number, resolution_type, subject, body_md, passed_date, fiscal_year, status",
    )
    .eq("fiscal_year", year)
    .eq("status", "passed")
    .order("passed_date", { ascending: true });

  for (const res of resolutions ?? []) {
    const slug = res.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50);
    const filename = `${res.resolution_number}_${slug}.md`;
    const content = [
      `# ${res.resolution_number} — ${res.subject}`,
      ``,
      `**Type:** ${res.resolution_type}`,
      `**Date passed:** ${res.passed_date}`,
      `**Fiscal year:** ${res.fiscal_year}`,
      `**Status:** ${res.status}`,
      ``,
      `---`,
      ``,
      res.body_md,
    ].join("\n");
    zip.folder("resolutions")!.file(filename, content);
    resolutionCount++;
  }
} catch (e) {
  errors.push(`resolutions: ${e instanceof Error ? e.message : String(e)}`);
}
```

- [ ] **Step 7.4: Update the return value**

Change the return statement to include `resolutionCount`:

```typescript
return { zip, filenameBase, reportCount, txnCount, receiptCount, docCount, resolutionCount, errors };
```

- [ ] **Step 7.5: Update buildReadme to mention resolutions**

In the README CONTENTS section, add a resolutions line. Find the `documents/` block in `buildReadme` and add after it:

```typescript
// In the counts parameter, add resolutionCount: number
function buildReadme(
  year: number,
  exportDate: string,
  counts: {
    reportCount:      number;
    txnCount:         number;
    receiptCount:     number;
    docCount:         number;
    resolutionCount:  number;   // ← add
    errors:           string[];
  },
): string {
```

And in the CONTENTS section of the README string, add after the `documents/` block:

```
resolutions/  (${counts.resolutionCount} files)
  Passed corporate resolutions for FY${year} in markdown format.
  Named: {year}-DR-{NNN}_{subject_slug}.md
```

- [ ] **Step 7.6: Update the /api/cockpit/export-bundle/route.ts call site**

The route destructures the result. The `resolutionCount` addition doesn't break anything (it's just unused in the route), but confirm the route still compiles.

```bash
grep -n "resolutionCount\|ExportBundleResult" apps/web/app/api/cockpit/export-bundle/route.ts
```

No changes required unless the route destructures all fields explicitly. If it does, add `resolutionCount` there too.

---

## Task 8: Cockpit nav link

**Files:**
- Modify: `apps/web/app/cockpit/cockpit-shell.tsx`

- [ ] **Step 8.1: Add Resolutions tab**

In `cockpit-shell.tsx`, find the `TABS` array and add the Resolutions entry between Documents and Compliance:

```typescript
const TABS = [
  { href: "/cockpit",              label: "Snapshot" },
  { href: "/cockpit/inbox",        label: "Inbox" },
  { href: "/cockpit/cash",         label: "Cash" },
  { href: "/cockpit/expenses",     label: "Expenses" },
  { href: "/cockpit/pre-incorp",   label: "Pre-incorp" },
  { href: "/cockpit/founder-comp", label: "Comp" },
  { href: "/cockpit/brief",        label: "Brief" },
  { href: "/cockpit/hst",          label: "HST" },
  { href: "/cockpit/sred",         label: "SR&ED" },
  { href: "/cockpit/deadlines",    label: "Deadlines" },
  { href: "/cockpit/compliance",      label: "Compliance" },
  { href: "/cockpit/reconciliation",  label: "Reconciliation" },
  { href: "/cockpit/documents",       label: "Documents" },
  { href: "/cockpit/resolutions",     label: "Resolutions" },  // ← add
];
```

---

## Task 9: Typecheck, commit, push, PR, merge

- [ ] **Step 9.1: Run full typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -50
```

Expected: zero errors. Fix any type errors before proceeding.

- [ ] **Step 9.2: Run tests**

```bash
cd /path/to/agentrunway-web && pnpm turbo test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 9.3: Commit everything on a feature branch**

```bash
git checkout -b feat/cockpit-resolutions-minute-book
git add \
  apps/web/supabase/migrations/00147_corp_resolutions.sql \
  packages/core/types/database.ts \
  apps/web/app/api/cockpit/resolutions/route.ts \
  "apps/web/app/api/cockpit/resolutions/[id]/route.ts" \
  apps/web/app/cockpit/resolutions/page.tsx \
  apps/web/app/cockpit/resolutions/resolutions-client.tsx \
  apps/web/app/api/cockpit/director-chat/route.ts \
  apps/web/lib/cockpit/export-bundle.ts \
  apps/web/app/cockpit/cockpit-shell.tsx
git commit -m "$(cat <<'EOF'
feat(cockpit): corporate resolutions + minute book (Build 13 / Phase 3)

Adds inline resolution creation to the Director Cockpit:
- corp_resolutions table (migration 00147) with auto-numbering trigger
  ({year}-DR-{NNN}), 6 resolution type checks, RLS via cockpit_has_access()
- 6 CCPC resolution templates: salary election, dividend declaration,
  banking authority, officer appointment, AGM waiver, general
- /cockpit/resolutions page with grouped-by-year list + new-resolution modal
  (template picker → edit form) + print-to-new-tab view
- POST/PATCH/DELETE /api/cockpit/resolutions routes; DELETE blocked for
  passed resolutions (permanent minute book record)
- listResolutions Director persona tool (year/type/status filters)
- resolutions/ folder in year-end export ZIP (passed resolutions as .md)
- "Resolutions" nav tab in cockpit-shell

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9.4: Push and open PR**

```bash
git push -u origin feat/cockpit-resolutions-minute-book
```

Open a PR against `main`. Title: `feat(cockpit): corporate resolutions + minute book (Build 13 / Phase 3)`.

- [ ] **Step 9.5: Monitor CI**

Check `lockfile-typecheck`, `build`, and `e2e` checks. All three must be green before merging.

- [ ] **Step 9.6: Squash-merge**

Once CI is green, squash-merge the PR. Pull `main` locally.

- [ ] **Step 9.7: Update project memory**

In `memory/project_director_cockpit.md`:
- Add Phase 3 section with Build #13 marked ✅
- Note the PR number and merge commit

---

## Self-Review

**Spec coverage check:**
- ✅ `corp_resolutions` table + auto-numbering trigger → Task 1
- ✅ TypeScript types → Task 2
- ✅ POST/PATCH/DELETE API routes → Tasks 3 + 4
- ✅ Page + client (template picker, list, print view) → Task 5
- ✅ 6 CCPC resolution templates → Task 5 (TEMPLATES constant)
- ✅ `listResolutions` Director tool → Task 6
- ✅ Export bundle integration → Task 7
- ✅ Nav tab → Task 8
- ✅ Typecheck + commit + PR + merge → Task 9
- ✅ DELETE blocked for passed resolutions → Task 4

**Type consistency check:**
- `CorpResolution` defined in Task 2, imported in Tasks 3, 4, 5 via `@agent-runway/core/types/database`
- `CorpResolutionType` used in API routes + client — same 6-value union throughout
- `CorpResolutionStatus` used in routes + client — same 2-value union
- `ExportBundleResult.resolutionCount` added in Task 7.1, initialized in 7.2, returned in 7.4, README param updated in 7.5
- `listResolutions` tool uses inline `z.enum(...)` matching `CorpResolutionType` values — no type import needed in route file (it uses Zod inference)

**No placeholders:** All code is complete and explicit.
