/**
 * EVAL: validateTaxCopy() on generated tax copy.
 *
 * Tax output is information, not advice (forbidden: should, recommend, must,
 * need to, set aside, top up, ...). These are binary checks over the tax
 * copy the app GENERATES from engine figures, across a grid of synthetic
 * agents, so a new province, income or setting can't produce an advice verb:
 *
 *   1. Every tax-copy generator in packages/core/tax-copy, over a grid of
 *      provinces, incomes, methods and settings.
 *   2. Every exported tax-copy string.
 *   3. The tax diagnostic Flight Crew is handed (chat-diagnostics "tax"
 *      topic) for synthetic agents in four provinces, with the canonical
 *      disclaimer on Flight Crew's own tax answers.
 *   4. The Navigator safety net (validateNavigatorOutput) flags seeded
 *      advice and appends the disclaimer when it's missing.
 *
 * Deterministic: no model, no database (a column-projecting fake client).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import * as taxCopy from "@agent-runway/core/tax-copy";
import {
  alreadyCapturingNote,
  brokerageHstWithholdingHint,
  commissionPaidDateHint,
  dealGstHstLabel,
  dealGstHstNote,
  dealTaxPortionLabel,
  dealTaxPortionNote,
  gstHstReportNote,
  incomeReportingMethodHint,
  taxEstimateSpreadSentence,
  validateTaxCopy,
  CANONICAL_TAX_DISCLAIMER,
} from "@agent-runway/core/tax-copy";
import { PROVINCE_LABELS, type Province } from "@agent-runway/core/types/database";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { createClient } from "@/lib/supabase/server";
import { buildDiagnostics } from "@/lib/chat-diagnostics";
import { validateNavigatorOutput } from "@/lib/ai/security";
import { TAX_SAFETY_SYSTEM_MESSAGE } from "@/lib/ai/provider";
import { fakeSupabase, type Row } from "@/lib/ai/__tests__/helpers/fake-supabase";

const PROVINCES = Object.keys(PROVINCE_LABELS) as Province[];
const INCOMES = [0, 18_000, 42_000, 78_000, 135_000, 260_000];
const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error").map((d) => d.trigger);

describe("EVAL tax copy: generators over a grid of synthetic agents", () => {
  const generated: Array<[string, string]> = [];
  for (const province of PROVINCES) generated.push([`dealTaxPortionLabel(${province})`, dealTaxPortionLabel(province)]);
  for (const income of INCOMES) generated.push([`taxEstimateSpreadSentence(${income})`, taxEstimateSpreadSentence(income)]);
  for (const method of ["accrual", "cash"] as const) {
    generated.push([`incomeReportingMethodHint(${method})`, incomeReportingMethodHint(method)]);
    generated.push([`commissionPaidDateHint(${method})`, commissionPaidDateHint(method)]);
  }
  for (const withholds of [true, false]) generated.push([`brokerageHstWithholdingHint(${withholds})`, brokerageHstWithholdingHint(withholds)]);
  for (const label of ["HST", "GST", "GST + QST"]) {
    generated.push([`dealGstHstLabel(${label})`, dealGstHstLabel(label)]);
    for (const registered of [true, false]) {
      for (const brokerageWithholds of [true, false]) {
        generated.push([`dealGstHstNote(${label},${registered},${brokerageWithholds})`, dealGstHstNote({ label, registered, brokerageWithholds })]);
        for (const ytdGCI of [0, 64_000]) {
          const collectedYTD = registered && !brokerageWithholds ? ytdGCI * 0.15 : 0;
          generated.push([
            `gstHstReportNote(${label},${registered},${brokerageWithholds},${ytdGCI})`,
            gstHstReportNote({ label, registered, brokerageWithholds, collectedYTD, ytdGCI }),
          ]);
        }
      }
    }
  }
  for (const [taxPortion, annualTaxEstimate, projectedGCI] of [[0, 0, 0], [2_150, 18_400, 96_000], [11_000, 61_000, 310_000]]) {
    generated.push([
      `dealTaxPortionNote(${taxPortion})`,
      dealTaxPortionNote({ taxPortion, annualTaxEstimate, projectedGCI, taxYear: 2026 }),
    ]);
  }
  for (const [captured, annual, rate] of [[0, 0, 0], [3_120, 12_000, 0.26], [9_875, 25_000, 0.395]]) {
    generated.push([`alreadyCapturingNote(${captured})`, alreadyCapturingNote(captured, annual, rate)]);
  }
  generated.push(["TAX_SAFETY_SYSTEM_MESSAGE (Opus)", TAX_SAFETY_SYSTEM_MESSAGE]);

  it.each(generated)("%s has no advice verbs", (_name, text) => {
    expect(errorsIn(text)).toEqual([]);
  });
});

describe("EVAL tax copy: every exported tax-copy string", () => {
  // The verb lists themselves (FORBIDDEN_VERBS, ...) are arrays, not copy.
  const strings = Object.entries(taxCopy).filter(([, v]) => typeof v === "string") as Array<[string, string]>;
  it("finds the exported strings (guards against an empty list)", () => {
    expect(strings.length).toBeGreaterThan(10);
  });
  it.each(strings)("%s has no advice verbs", (_name, text) => {
    expect(errorsIn(text)).toEqual([]);
  });
});

describe("EVAL tax copy: the tax diagnostic Flight Crew is handed", () => {
  const USER = "eval-user-1";
  const AGENTS: Array<{ name: string; province: Province; gci: number; registered: boolean; incorporated: boolean }> = [
    { name: "NB, sole proprietor, GST/HST registered", province: "newBrunswick", gci: 96_000, registered: true, incorporated: false },
    { name: "ON, under the small supplier limit", province: "ontario", gci: 24_000, registered: false, incorporated: false },
    { name: "AB, high income", province: "alberta", gci: 310_000, registered: true, incorporated: false },
    { name: "NS, incorporated", province: "novaScotia", gci: 150_000, registered: true, incorporated: true },
  ];

  it.each(AGENTS)("$name: no advice verbs", async (a) => {
    const settings = createTestSettings({
      user_id: USER,
      province: a.province,
      goal_gci: a.gci,
      gst_hst_registered: a.registered,
      is_incorporated: a.incorporated,
      use_national_seasonality: false,
    });
    const closed: Row = {
      id: "tx-1", user_id: USER, date: "2026-03-14", commission_paid_date: null,
      sale_price: (a.gci / 2) / 0.025, commission_pct: 0.025, team_split_pct: null, gci_override: null, status: "closed",
    };
    const tables: Record<string, Row[]> = {
      user_settings: [settings as unknown as Row],
      transactions: [closed],
      pipeline_deals: [],
      listing_appointments: [],
      expense_categories: [],
      clients: [],
      history_items: [],
      receipt_expenses: [],
      referrals: [],
      recurring_expenses: [],
    };
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables).client as never);
    const text = await buildDiagnostics(USER, ["tax"]);
    expect(text.length).toBeGreaterThan(0);
    expect(errorsIn(text)).toEqual([]);
  });
});

describe("EVAL tax copy: the Navigator safety net", () => {
  it.each([
    "You should set aside 30% of every commission for taxes.",
    "I recommend you top up your instalments this quarter.",
    "You must register for HST now.",
  ])("flags seeded advice: %s", (answer) => {
    expect(validateNavigatorOutput(answer).valid).toBe(false);
  });

  it("reports which rule fired, never the reply's words (they can name clients)", () => {
    const out = validateNavigatorOutput("You should set aside $9,000 from the Pat Example deal at 12 Example St for taxes.");
    expect(out.valid).toBe(false);
    expect(out.issues.length).toBeGreaterThan(0);
    for (const issue of out.issues) expect(issue).toMatch(/^[a-z-]+( x\d+)?$/);
    expect(out.issues.join(" ")).not.toMatch(/Pat|Example|9,000/);
  });

  it("appends the canonical disclaimer to a tax answer that lacks it", () => {
    const out = validateNavigatorOutput("Based on your projected net income, the engine estimates about $18,400 in federal and provincial income tax and CPP.");
    expect(out.text).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("passes an informational answer that carries the disclaimer", () => {
    const answer = `The engine estimates about $18,400 in income tax and CPP for 2026, based on your projected net income.\n\n${CANONICAL_TAX_DISCLAIMER}`;
    expect(validateNavigatorOutput(answer)).toMatchObject({ valid: true });
  });
});
