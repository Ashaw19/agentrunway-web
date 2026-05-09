/**
 * GET /api/cockpit/sred/export?year=2026
 *
 * Returns a T661-ready CSV of SR&ED work-log entries for the given fiscal year.
 * Columns follow CRA T661 narrative section guidance.
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpSredEntry } from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const WEIGHT_FACTORS: Record<string, number> = {
  high:   1.00,
  medium: 0.50,
  low:    0.15,
  none:   0.00,
};

const WEIGHT_LABELS: Record<string, string> = {
  high:   "High (1.00)",
  medium: "Medium (0.50)",
  low:    "Low (0.15)",
  none:   "None (0.00)",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  const first = s.charAt(0);
  const prefixed = ["=", "+", "-", "@", "|", "\t"].includes(first) ? "'" + s : s;
  if (/[",\r\n]/.test(prefixed)) return `"${prefixed.replace(/"/g, '""')}"`;
  return prefixed;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return new Response(JSON.stringify({ error: "invalid year" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: entries, error } = await supabase
    .from("corp_sred_entries")
    .select("*")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`)
    .order("entry_date", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = (entries ?? []) as CorpSredEntry[];

  // Build CSV
  const headers = [
    "Date",
    "Hours Logged",
    "SR&ED Weight",
    "Eligible Hours",
    "Work Summary (T661 Narrative)",
    "Technological Challenges / Advances",
    "SR&ED Characterization",
    "Commits",
    "PR / Branch Refs",
  ];

  const lines: string[] = [headers.map(csvEscape).join(",")];
  let totalHours = 0;
  let totalEligible = 0;

  for (const row of rows) {
    const factor = WEIGHT_FACTORS[row.sred_weight] ?? 0;
    const eligibleHours = Number((row.hours * factor).toFixed(2));
    totalHours += row.hours;
    totalEligible += eligibleHours;

    lines.push([
      csvEscape(row.entry_date),
      csvEscape(row.hours),
      csvEscape(WEIGHT_LABELS[row.sred_weight] ?? row.sred_weight),
      csvEscape(eligibleHours),
      csvEscape(row.work_summary),
      csvEscape(row.tech_challenges),
      csvEscape(row.sred_note),
      csvEscape(row.commits_count),
      csvEscape(row.pr_refs),
    ].join(","));
  }

  // Totals row
  lines.push([
    csvEscape(`FY${year} TOTALS`),
    csvEscape(Number(totalHours.toFixed(2))),
    "",
    csvEscape(Number(totalEligible.toFixed(2))),
    csvEscape(`${rows.length} entries`),
    "",
    "",
    "",
    "",
  ].join(","));

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);
  const filename = `AR-Inc-SR&ED-FY${year}-working-paper-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
