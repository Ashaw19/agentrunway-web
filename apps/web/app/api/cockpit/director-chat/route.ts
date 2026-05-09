/**
 * /api/cockpit/director-chat
 *
 * Internal-only Director persona chat endpoint. Allowlisted to Andrew's
 * account by the same `ALLOWED_EMAILS` set the cockpit layout uses; everyone
 * else gets a 403 before any prompt is constructed. Distinct from the
 * customer-facing /api/chat (Flight Crew) — the two share NO tools and NO
 * system prompts.
 *
 * Mostly read-only — tools query corp_* tables and reporting views — but as
 * of Build D (2026-05-09) the Director can also INSERT directly into 5 tables
 * via narrow write-side tools: SR&ED log entries, cash snapshots, compliance
 * events, inbox items, and resolutions (drafts only). Writes go through the
 * authenticated `supabase` client and are RLS-bound to Andrew's user_id.
 *
 * Write tools intentionally never UPDATE or DELETE — corrections still flow
 * through the corresponding cockpit page. The Director is an entry assistant,
 * not a record editor.
 *
 * See lib/cockpit/director-persona.ts for the system prompt and the internal
 * carve-out from the customer-facing tax-info-not-advice rule.
 */

import { NextRequest } from "next/server";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import {
  DIRECTOR_SYSTEM_PROMPT,
  DIRECTOR_INTERNAL_DISCLAIMER,
} from "@/lib/cockpit/director-persona";
import { log } from "@/lib/logger";

export const maxDuration = 120;
export const runtime = "nodejs";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = (await req.json()) as { messages?: ChatMessage[] };
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "no_messages" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // ── Read-only corporate tools ─────────────────────────────────────────────
  // All tools are scoped to the authenticated user via RLS; the queries below
  // do not pass user_id explicitly because cockpit_has_access() and the RLS
  // policies on each table enforce the boundary.

  const tools = {
    /**
     * P&L by account, optionally filtered by year. Source: v_corp_pl_by_account.
     */
    plByAccount: tool({
      description:
        "Read the corporate P&L grouped by chart-of-accounts entry for the current fiscal year (calendar year). Returns account_code, account_name, account_type, and total_amount per account.",
      inputSchema: z.object({
        year: z
          .number()
          .int()
          .optional()
          .describe("Calendar year to filter on. Defaults to the current year."),
      }),
      execute: async ({ year }) => {
        const targetYear = year ?? new Date().getFullYear();
        const { data, error } = await supabase
          .from("v_corp_pl_by_account")
          .select("account_code, account_name, account_type, total_amount, year")
          .eq("year", targetYear)
          .order("account_code", { ascending: true });
        if (error) return { error: error.message };
        return { year: targetYear, rows: data ?? [] };
      },
    }),

    /**
     * GST/HST summary by quarter. Source: v_corp_gst_hst_summary.
     */
    gstHstSummary: tool({
      description:
        "Read the corporate HST/GST summary by quarter — collected, ITCs, and net owing. Useful for filing prep and instalment framing.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("v_corp_gst_hst_summary")
          .select("*")
          .order("period", { ascending: false })
          .limit(8);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * SR&ED eligible totals. Source: v_corp_sred_eligible_totals.
     */
    sredEligibleTotals: tool({
      description:
        "Read total SR&ED-eligible expense amounts grouped by account. Use this when Andrew asks about SR&ED daily-log totals or T661 prep.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("v_corp_sred_eligible_totals")
          .select("*");
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Shareholder loan running balance. Source: v_corp_shareholder_loan_balance.
     */
    shareholderLoanBalance: tool({
      description:
        "Read the running shareholder-loan balance for AR Inc. Useful for s.15(2) timing questions (loan repayment within 1 year of fiscal year-end).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("v_corp_shareholder_loan_balance")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(50);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Pre-incorporation expense register. Source: v_corp_pre_incorp_register.
     */
    preIncorpRegister: tool({
      description:
        "Read the pre-incorporation expense register (expenses incurred before the corp's incorporation date that may be eligible for s.20(1)(b) treatment up to the $3,000 limit). Use when Andrew asks about the pre-incorp running total.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("v_corp_pre_incorp_register")
          .select("*")
          .order("incurred_date", { ascending: true });
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Latest cash-position snapshot. Source: corp_cash_snapshots.
     */
    cashPositionLatest: tool({
      description:
        "Read the most recent manually-logged corporate cash position snapshot. Use this when Andrew asks 'how much cash do we have' or wants the runway-month input.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("corp_cash_snapshots")
          .select("*")
          .order("snapshot_date", { ascending: false })
          .limit(3);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Recent brief entries written by the scheduled routines (Hugo, Vera,
     * Quinn, Tessa, Marcus). Source: corp_brief_entries.
     */
    recentBriefs: tool({
      description:
        "Read recent corporate brief entries from the scheduled routines (Hugo bookkeeping, Vera monthly cash, Quinn quarterly HST, Tessa annual T2, Marcus SR&ED). Use this to surface what the routines have flagged.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("corp_brief_entries")
          .select("brief_date, source, title, content_md, des_priority, created_at")
          .order("brief_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Open inbox items. Source: corp_inbox_items.
     */
    openInbox: tool({
      description:
        "Read open task-inbox items for the operator. Each item has a source, severity, and source_ref_id pointing at the upstream record (e.g., a vendor, a transaction, a brief).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("corp_inbox_items")
          .select("*")
          .is("resolved_at", null)
          .order("severity", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Bank reconciliation summary. Source: v_corp_bank_reconciliation_summary.
     * Phase 2 / Build #9.
     */
    bankReconciliationSummary: tool({
      description:
        "Read the bank reconciliation summary for the most recent uploaded bank statements. Returns match rate, row counts (total / matched / manual / unmatched), bank name, and statement period. Use this when Andrew asks about reconciliation health, unmatched bank lines, match rate, or whether the ledger is reconciled.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Number of recent statements to return. Defaults to 3."),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("v_corp_bank_reconciliation_summary")
          .select(
            "statement_id, bank_name, account_label, period_start, period_end, row_count, matched_count, manual_count, unmatched_count, match_rate_pct, uploaded_at",
          )
          .order("period_end", { ascending: false })
          .limit(limit ?? 3);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    /**
     * Proactive governance scan: ITC documentation gaps, commingling signals,
     * and unclassified transactions. Phase 2 / Build #12.
     * Director calls this proactively on session start and on governance questions.
     */
    governanceScan: tool({
      description:
        "Proactive governance scan: detects ITC documentation gaps (HST claimed with no receipt), commingling signals (mixed-use transactions still flagged for review), and unclassified transactions (no account code). Call this proactively at the start of every session before answering the user's specific question.",
      inputSchema: z.object({
        year: z
          .number()
          .int()
          .optional()
          .describe("Calendar year to scan. Defaults to current year."),
      }),
      execute: async ({ year }) => {
        const targetYear = year ?? new Date().getFullYear();
        const startDate = `${targetYear}-01-01`;
        const endDate = `${targetYear}-12-31`;

        // ITC gaps: HST amount present but no receipt attached
        const { data: itcGaps, error: itcErr } = await supabase
          .from("corp_transactions")
          .select("id, date, merchant_name, amount_pretax, gst_hst, account_code, review_reason")
          .gte("date", startDate)
          .lte("date", endDate)
          .gt("gst_hst", 0)
          .is("receipt_storage_path", null)
          .order("gst_hst", { ascending: false })
          .limit(20);

        // Commingling: mixed-use allocations still flagged for review
        const { data: commingling, error: commErr } = await supabase
          .from("corp_transactions")
          .select("id, date, merchant_name, amount_total, corp_pct, review_reason, needs_review")
          .gte("date", startDate)
          .lte("date", endDate)
          .lt("corp_pct", 1)
          .eq("needs_review", true)
          .order("amount_total", { ascending: false })
          .limit(20);

        // Unclassified: no account code assigned
        const { data: unclassified, error: unclassErr } = await supabase
          .from("corp_transactions")
          .select("id, date, merchant_name, amount_total, review_reason")
          .gte("date", startDate)
          .lte("date", endDate)
          .is("account_code", null)
          .order("date", { ascending: false })
          .limit(10);

        // Full needs-review queue
        const { data: needsReview, error: reviewErr } = await supabase
          .from("corp_transactions")
          .select("id, date, merchant_name, amount_total, review_reason, corp_pct, gst_hst")
          .gte("date", startDate)
          .lte("date", endDate)
          .eq("needs_review", true)
          .order("date", { ascending: false })
          .limit(30);

        const itcRows = itcErr ? [] : (itcGaps ?? []);
        const totalHSTAtRisk = itcRows.reduce(
          (sum: number, r: { gst_hst?: number | null }) => sum + (r.gst_hst ?? 0),
          0,
        );

        return {
          year: targetYear,
          itcDocumentationGaps: {
            ...(itcErr ? { error: itcErr.message } : {}),
            count: itcRows.length,
            totalHSTAtRisk: Math.round(totalHSTAtRisk * 100) / 100,
            topOffenders: itcRows.slice(0, 10),
          },
          comminglingFlags: {
            ...(commErr ? { error: commErr.message } : {}),
            count: commErr ? 0 : (commingling ?? []).length,
            rows: commErr ? [] : (commingling ?? []),
          },
          unclassifiedTransactions: {
            ...(unclassErr ? { error: unclassErr.message } : {}),
            count: unclassErr ? 0 : (unclassified ?? []).length,
            rows: unclassErr ? [] : (unclassified ?? []),
          },
          needsReviewQueue: {
            ...(reviewErr ? { error: reviewErr.message } : {}),
            count: reviewErr ? 0 : (needsReview ?? []).length,
            rows: reviewErr ? [] : (needsReview ?? []),
          },
        };
      },
    }),

    /**
     * Corporate resolutions (minute book). Source: corp_resolutions.
     * Phase 3 / Build #13.
     */
    listResolutions: tool({
      description:
        "Read corporate resolutions (minute book) for AR Inc. Returns resolution_number, type, subject, passed_date, status, and body_md. Use when Andrew asks what resolutions have been passed, whether a salary election exists for a given year, or wants to review the minute book.",
      inputSchema: z.object({
        year: z
          .number()
          .int()
          .optional()
          .describe("Fiscal year to filter on. Defaults to current year."),
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
          .describe("Filter by resolution type. Omit to return all types."),
        status: z
          .enum(["draft", "passed"])
          .optional()
          .describe("Filter by status. Omit to return all statuses."),
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

    /**
     * Upcoming compliance events. Source: v_corp_upcoming_compliance.
     * Phase 2 / Build #8.
     */
    upcomingCompliance: tool({
      description:
        "Read upcoming and overdue compliance calendar events for AR Inc. — T2 filing/payment, HST/GST quarterly filings and instalments, federal and NB annual returns, T4 / source deductions, minute-book updates, insurance renewals. Each row has a due_date, an urgency tier (overdue / critical / soon / upcoming), days_until_due, severity, kind, and notes. Use this when Andrew asks 'what's due', 'what's coming up', 'when is T2', 'what's overdue', or any compliance-deadline framing.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max events to return. Defaults to 20."),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("v_corp_upcoming_compliance")
          .select(
            "id, title, kind, due_date, severity, recurring_pattern, notes, days_until_due, urgency",
          )
          .order("due_date", { ascending: true })
          .limit(limit ?? 20);
        if (error) return { error: error.message };
        return { rows: data ?? [] };
      },
    }),

    sredSummary: tool({
      description:
        "Retrieve SR&ED work-log summary and recent entries for AR Inc. Returns annual totals (total hours, eligible hours, weight breakdown) plus up to 30 recent log entries. Use this when Andrew asks about SR&ED progress, eligible hours, T661 preparation, SR&ED ITC estimates, or how much SR&ED work has been logged.",
      inputSchema: z.object({
        year: z
          .number()
          .int()
          .min(2026)
          .max(2100)
          .optional()
          .describe("Fiscal year. Defaults to current year."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max recent entries to return. Defaults to 20."),
      }),
      execute: async ({ year, limit }) => {
        const fiscalYear = year ?? new Date().getFullYear();
        const [summaryRes, entriesRes] = await Promise.all([
          supabase
            .from("v_corp_sred_annual_summary")
            .select("*")
            .eq("fiscal_year", fiscalYear)
            .single(),
          supabase
            .from("corp_sred_entries")
            .select("entry_date, hours, sred_weight, work_summary, tech_challenges, sred_note, pr_refs")
            .gte("entry_date", `${fiscalYear}-01-01`)
            .lte("entry_date", `${fiscalYear}-12-31`)
            .order("entry_date", { ascending: false })
            .limit(limit ?? 20),
        ]);
        return {
          fiscal_year: fiscalYear,
          summary: summaryRes.data ?? null,
          recent_entries: entriesRes.data ?? [],
          note: "Eligible hours use weights: high=1.00, medium=0.50, low=0.15, none=0.00. ITC estimate: eligible_hours × $80/hr × 35% (federal CCPC). For accountant review only.",
        };
      },
    }),

    // ── Write-side tools (Build D, 2026-05-09) ────────────────────────────
    // Narrow INSERT-only tools so the Director can act as an entry assistant.
    // No UPDATE, no DELETE — corrections still flow through the cockpit pages.
    // All inserts include user_id from the authenticated supabase client and
    // are RLS-bound. Each tool validates inputs against the same enums as the
    // table CHECK constraints.

    /**
     * Insert a new SR&ED log entry. Build #14 / migration 00148.
     */
    logSredEntry: tool({
      description:
        "Insert a new SR&ED daily work-log entry into corp_sred_entries. Use when Andrew asks to log SR&ED time / record yesterday's work / capture an entry he forgot. Requires entry_date (YYYY-MM-DD), hours (0-24), work_summary, and sred_weight (none/low/medium/high). Optional: tech_challenges, sred_note, commits_count, pr_refs. Returns the inserted row including computed eligible_hours basis. Use safe verbs only — never tell Andrew which weight to pick; surface the categorical definition and let him choose.",
      inputSchema: z.object({
        entry_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Date the work was performed, YYYY-MM-DD."),
        hours: z
          .number()
          .min(0)
          .max(24)
          .describe("Hours worked that day."),
        work_summary: z
          .string()
          .min(3)
          .describe("Plain-language description of the work — what was built or investigated."),
        sred_weight: z
          .enum(["none", "low", "medium", "high"])
          .describe(
            "T661 weight category: high=directly advancing technological uncertainty, medium=hybrid (architecture/debugging with novel uncertainty), low=setup/environment/tooling supporting SR&ED work, none=admin/business/content. Eligibility multipliers: high=1.0, medium=0.5, low=0.15, none=0.0.",
          ),
        tech_challenges: z
          .string()
          .nullable()
          .optional()
          .describe("Optional T661 narrative material on what technological challenges were addressed."),
        sred_note: z
          .string()
          .nullable()
          .optional()
          .describe("Optional internal triage note (e.g. 'flag for accountant review')."),
        commits_count: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional()
          .describe("Optional commit count for the day."),
        pr_refs: z
          .string()
          .nullable()
          .optional()
          .describe("Optional PR / branch references (free-text)."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("corp_sred_entries")
          .insert({
            user_id: user.id,
            entry_date: input.entry_date,
            hours: input.hours,
            work_summary: input.work_summary,
            sred_weight: input.sred_weight,
            tech_challenges: input.tech_challenges ?? null,
            sred_note: input.sred_note ?? null,
            commits_count: input.commits_count ?? null,
            pr_refs: input.pr_refs ?? null,
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { ok: true, entry: data };
      },
    }),

    /**
     * Insert a new cash-position snapshot. Migration 00135.
     */
    logCashSnapshot: tool({
      description:
        "Insert a manual cash-position snapshot into corp_cash_snapshots. Latest snapshot by as_of_date drives the Snapshot card's cash position, monthly burn calc, and SaaS runway. Use when Andrew shares a current bank balance or wants to record a cash-position checkpoint.",
      inputSchema: z.object({
        as_of_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Date the balance was observed, YYYY-MM-DD."),
        amount_cad: z
          .number()
          .min(0)
          .describe("Cash balance in CAD (combined across accounts)."),
        source_label: z
          .string()
          .nullable()
          .optional()
          .describe("Optional source — e.g. 'RBC business chequing', 'combined ops + tax reserve'."),
        notes: z
          .string()
          .nullable()
          .optional()
          .describe("Optional context — pending deposits / outstanding cheques / accountant note."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("corp_cash_snapshots")
          .insert({
            user_id: user.id,
            as_of_date: input.as_of_date,
            amount_cad: input.amount_cad,
            source_label: input.source_label ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { ok: true, snapshot: data };
      },
    }),

    /**
     * Insert a new compliance calendar event. Phase 2 / Build #8.
     */
    addComplianceEvent: tool({
      description:
        "Add a new event to the corporate compliance calendar (corp_compliance_events). Use when Andrew flags an upcoming deadline he wants tracked — accountant follow-up, insurance renewal, agency notice, custom T2 prep date. For seeded recurring events, use the cockpit UI instead so the seed metadata stays consistent. Requires title, due_date (YYYY-MM-DD), kind (enum), severity (low/medium/high). Optional: recurring_pattern (annual/quarterly/monthly/fiscal-anniversary), notes.",
      inputSchema: z.object({
        title: z.string().min(3).describe("Event title."),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Due date, YYYY-MM-DD."),
        kind: z
          .enum([
            "cra-t2-filing",
            "cra-t2-payment",
            "cra-hst-filing",
            "cra-hst-instalment",
            "cra-payroll-t4",
            "cra-payroll-source-deductions",
            "corp-annual-return-federal",
            "corp-annual-return-nb",
            "corp-minute-book",
            "corp-insurance-renewal",
            "corp-other",
          ])
          .describe("Event kind. Use 'corp-other' if nothing else fits."),
        severity: z
          .enum(["low", "medium", "high"])
          .default("medium")
          .describe("Filing deadlines = high; minute book = medium; insurance renewal = low."),
        recurring_pattern: z
          .enum(["annual", "quarterly", "monthly", "fiscal-anniversary"])
          .nullable()
          .optional()
          .describe("Recurrence pattern. Omit / null for one-off events."),
        notes: z
          .string()
          .nullable()
          .optional()
          .describe("Optional reminder text — accountant note, prep checklist."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("corp_compliance_events")
          .insert({
            user_id: user.id,
            title: input.title,
            due_date: input.due_date,
            kind: input.kind,
            severity: input.severity,
            recurring_pattern: input.recurring_pattern ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { ok: true, event: data };
      },
    }),

    /**
     * Insert a new task into the cockpit inbox. Migration 00139.
     */
    addInboxItem: tool({
      description:
        "Add an item to the Director Cockpit task inbox (corp_inbox_items). Use when Andrew flags something he needs to act on later — categorization decision, accountant question, follow-up call. The item appears on /cockpit/inbox until Andrew resolves it. Requires title and severity. Optional: body (longer context).",
      inputSchema: z.object({
        title: z.string().min(3).describe("Short actionable title."),
        body: z
          .string()
          .nullable()
          .optional()
          .describe("Optional longer context / details."),
        severity: z
          .enum(["low", "medium", "high"])
          .default("medium")
          .describe("Action urgency. high = needs same-day; medium = within a week; low = nice-to-have."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("corp_inbox_items")
          .insert({
            user_id: user.id,
            title: input.title,
            body: input.body ?? null,
            severity: input.severity,
            source: "director-persona",
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { ok: true, item: data };
      },
    }),

    /**
     * Draft a new corporate resolution. Build #13 / migration 00147.
     * Inserts as status='draft' — Andrew opens /cockpit/resolutions to
     * review and pass it. The Director never inserts a passed resolution.
     */
    draftResolution: tool({
      description:
        "Draft a new corporate resolution as a DRAFT (not passed). Andrew reviews + edits + marks passed via /cockpit/resolutions. Use when he asks 'draft a resolution for X' — e.g. salary election, dividend declaration, banking authority. resolution_number and fiscal_year are auto-assigned by the DB trigger. Body should follow proper CCPC 'BE IT RESOLVED THAT...' language.",
      inputSchema: z.object({
        resolution_type: z
          .enum([
            "salary_election",
            "dividend_declaration",
            "banking_authority",
            "officer_appointment",
            "agm_waiver",
            "general",
          ])
          .describe("Resolution type."),
        subject: z.string().min(3).describe("One-line subject line."),
        body_md: z
          .string()
          .min(20)
          .describe(
            "Full markdown body. Should follow CCPC 'BE IT RESOLVED THAT...' resolved-language convention.",
          ),
        passed_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe(
            "Intended passed_date (YYYY-MM-DD). Determines fiscal_year. Andrew can edit before marking passed.",
          ),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("corp_resolutions")
          .insert({
            user_id: user.id,
            resolution_type: input.resolution_type,
            subject: input.subject.trim(),
            body_md: input.body_md,
            passed_date: input.passed_date,
            status: "draft",
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { ok: true, resolution: data };
      },
    }),
  };

  try {
    const result = streamText({
      model: models.default,
      system: DIRECTOR_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools,
      stopWhen: stepCountIs(6),
      maxOutputTokens: 2000,
      temperature: 0.3,
      headers: heliconeHeaders({
        userId: user.id,
        feature: "cockpit-director-chat",
      }),
    });

    return result.toTextStreamResponse({
      headers: {
        "x-request-id": requestId,
        "x-director-disclaimer": "internal-operator",
      },
    });
  } catch (err) {
    log.error(
      { requestId, message: err instanceof Error ? err.message : String(err) },
      "[cockpit/director-chat] Stream error",
    );
    return new Response(
      JSON.stringify({
        error: "stream_failed",
        message:
          "Director chat hit an internal error. Try again, or simplify the question.",
        disclaimer: DIRECTOR_INTERNAL_DISCLAIMER,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
