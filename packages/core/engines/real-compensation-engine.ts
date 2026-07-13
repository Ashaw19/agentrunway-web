// RealCompensationEngine — canonical REAL Brokerage per-deal waterfall.
//
// WHY THIS EXISTS
// ---------------
// REAL Brokerage compensation is NOT a static split: the agent's share flips
// when their annual cap (company dollar paid to REAL, NOT GCI crossed) is
// reached, post-cap deals pay flat fees instead of a percentage, an "Elite"
// threshold drops that fee, and per-deal/annual fees (CBR, BEOP, Year-1
// sign-up) drag net income. A single `split_preset` cannot represent this —
// every surface that used the static split under `comp_plan = 'real'` must
// read THIS engine's output instead. Never re-implement any part of this
// waterfall in a route, component, MCP tool, or cron — the whole point is one
// source of truth (see memory/feedback_data_consistency_protocol.md).
//
// MODEL (source: Agent-Runway-REAL-Compensation-Variables-Spec.md — a
// snapshot of the REAL income deck; all figures user-editable in settings):
//   * Pre-cap: REAL takes a fixed 15% of GCI (REAL_COMPANY_DOLLAR_RATE);
//     the agent keeps `real_pre_cap_agent_pct` (any remainder is a team-
//     leader override, which this engine does not need to model separately).
//   * The CAP counts REAL's 15% take. When cumulative take reaches
//     `real_cap_amount` within the ANNIVERSARY YEAR (anchored on
//     `real_join_date`), the agent flips to post-cap for the rest of it.
//   * A deal can STRADDLE the cap: the portion of GCI whose 15% fits in the
//     remaining cap room is paid at pre-cap terms; the remainder at post-cap.
//   * Post-cap: agent keeps `real_post_cap_agent_pct` (solo = 100%) and REAL
//     charges a flat `real_post_cap_fee` per deal, dropping to
//     `real_elite_fee` once cumulative post-cap fees ≥ `real_elite_threshold`.
//   * Every deal pays the CBR fee. BEOP is amortized over the first 3 deals
//     of each anniversary year. The sign-up fee hits the first deal of
//     anniversary year 1 only.
//   * `real_cap_paid_seed` / `real_post_cap_fees_paid_seed` seed the CURRENT
//     anniversary year (the one containing `asOf`) for mid-year switchers
//     whose earlier REAL deals aren't in Agent Runway.
//
// DOCUMENTED ASSUMPTIONS (flagged ⚠️ in the spec / unverified with REAL):
//   * A straddle deal with ANY post-cap portion pays the full post-cap flat
//     fee (not prorated). Conservative: slightly understates net.
//   * The deal that crosses the Elite threshold pays the FULL post-cap fee;
//     the discount starts on the NEXT deal.
//   * CBR is per-transaction (spec ⚠️ says possibly one-time — set
//     `real_cbr_fee` to 0 if REAL confirms one-time).
//   * BEOP amortizes over the first 3 deals of the ANNIVERSARY year; years
//     with fewer than 3 deals are only charged the amortized portions.
//   * No `real_join_date` → the anniversary year falls back to the calendar
//     year of `asOf`, and no deal is excluded as pre-join.
//
// SEE ALSO
// --------
// - packages/core/engines/effective-cash.ts (the net-income orchestration
//   chain this engine plugs into)
// - memory/project_real_comp_model.md (workstream + verification gaps)

import {
  REAL_COMPANY_DOLLAR_RATE,
  SPLIT_PRESET_AGENT_PCT,
  computeAgentGross,
  computeTxFees,
  type CompPlan,
  type UserSettings,
} from "../types/database";

// ── Inputs ────────────────────────────────────────────────────────────────────

/** The slice of UserSettings this engine reads. */
export type RealCompSettings = Pick<
  UserSettings,
  | "comp_plan"
  | "split_preset"
  | "real_join_date"
  | "real_cap_amount"
  | "real_pre_cap_agent_pct"
  | "real_post_cap_agent_pct"
  | "real_post_cap_fee"
  | "real_elite_fee"
  | "real_elite_threshold"
  | "real_cbr_fee"
  | "real_beop_annual"
  | "real_signup_fee"
  | "real_cap_paid_seed"
  | "real_post_cap_fees_paid_seed"
>;

/** One closed deal. `gci` is the PRE-SPLIT gross commission for the agent's
 *  side (same semantics as computeGCI / import gci). */
export interface RealDealInput {
  id?: string;
  /** Close date, YYYY-MM-DD. */
  date: string;
  gci: number;
}

// ── Outputs ───────────────────────────────────────────────────────────────────

export interface RealDealBreakdown {
  id?: string;
  date: string;
  gci: number;
  /** True when the deal closed before real_join_date — paid under the legacy
   *  split_preset, untouched by the REAL waterfall. */
  preJoin: boolean;
  /** GCI portion paid at pre-cap terms (may be partial on a straddle deal). */
  preCapGci: number;
  /** GCI portion paid at post-cap terms. */
  postCapGci: number;
  /** REAL's company-dollar take on this deal (counts toward the cap). */
  companyDollar: number;
  /** Agent share after splits, before fees. */
  agentShare: number;
  fees: {
    postCap: number;
    cbr: number;
    beop: number;
    signup: number;
    total: number;
  };
  /** agentShare − fees.total. What actually lands from this deal. */
  agentNet: number;
}

export interface RealCapState {
  /** Anniversary-year window containing `asOf` (start inclusive, end exclusive), YYYY-MM-DD. */
  anniversaryStart: string;
  anniversaryEnd: string;
  capAmount: number;
  /** Company dollar paid within the current anniversary year (incl. seed). */
  capPaid: number;
  capRemaining: number;
  capped: boolean;
  /** Close date of the deal that capped the agent this anniversary year. */
  cappedOnDate: string | null;
  /** Cumulative post-cap fees this anniversary year (incl. seed). */
  postCapFeesPaid: number;
  eliteActive: boolean;
}

export interface RealCompResult {
  deals: RealDealBreakdown[];
  capState: RealCapState;
}

export interface RealCompAggregate {
  gci: number;
  agentShare: number;
  fees: number;
  agentNet: number;
  dealCount: number;
  /** agentNet / gci for the window. Zero-deal windows fall back to the
   *  pre-cap split (best available approximation for projections). */
  effectiveAgentPct: number;
}

// ── Date helpers (string math on YYYY-MM-DD; noon-anchored to dodge UTC) ─────

function toDate(iso: string): Date {
  return new Date(iso.slice(0, 10) + "T12:00:00");
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add whole years, clamping Feb 29 → Feb 28 on non-leap targets. */
function addYears(iso: string, n: number): string {
  const d = toDate(iso);
  const targetYear = d.getFullYear() + n;
  const month = d.getMonth();
  const day = d.getDate();
  const clamped = new Date(targetYear, month, 1, 12);
  const daysInMonth = new Date(targetYear, month + 1, 0).getDate();
  clamped.setDate(Math.min(day, daysInMonth));
  return toISO(clamped);
}

/** Anniversary-year window [start, end) containing `asOf`, anchored on joinDate.
 *  No joinDate → calendar year of asOf. Exported for cap-progress UI copy. */
export function anniversaryWindow(
  joinDate: string | null,
  asOf: string,
): { start: string; end: string; yearIndex: number } {
  if (!joinDate) {
    const y = asOf.slice(0, 4);
    return { start: `${y}-01-01`, end: `${Number(y) + 1}-01-01`, yearIndex: 0 };
  }
  // Walk anniversary boundaries until the window contains asOf. An asOf
  // before joinDate clamps to year 0 (the first anniversary year).
  let idx = 0;
  while (addYears(joinDate, idx + 1) <= asOf) idx++;
  return { start: addYears(joinDate, idx), end: addYears(joinDate, idx + 1), yearIndex: idx };
}

// ── Core waterfall ────────────────────────────────────────────────────────────

/**
 * Run every deal through the REAL waterfall in close-date order.
 *
 * Processes ALL deals (multi-anniversary-year safe: the cap, Elite state,
 * and BEOP amortization reset at each anniversary boundary). Deals dated
 * before `real_join_date` are passed through marked `preJoin: true` with the
 * LEGACY split applied (split_preset), so a mixed Royal LePage → REAL year
 * aggregates correctly from one result.
 *
 * Seeds (`real_cap_paid_seed`, `real_post_cap_fees_paid_seed`) apply only to
 * the anniversary year containing `asOf` — per their settings semantics
 * ("already paid THIS anniversary year outside app data").
 */
export function computeRealCompensation(
  settings: RealCompSettings,
  deals: RealDealInput[],
  asOf: string,
): RealCompResult {
  const joinDate = settings.real_join_date;
  const current = anniversaryWindow(joinDate, asOf);
  const legacyPct = SPLIT_PRESET_AGENT_PCT[settings.split_preset] ?? 0.8;

  const sorted = [...deals]
    .filter((d) => Number.isFinite(d.gci) && d.gci > 0 && /^\d{4}-\d{2}-\d{2}/.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const breakdowns: RealDealBreakdown[] = [];

  // Per-anniversary-year mutable state
  let windowStart = "";
  let windowEnd = "";
  let capPaid = 0;
  let postCapFeesPaid = 0;
  let dealsThisYear = 0;
  let cappedOnDate: string | null = null;
  let signupCharged = false; // once ever (anniversary year 1 only)

  const resetYear = (start: string, end: string) => {
    windowStart = start;
    windowEnd = end;
    // Seeds belong to the CURRENT anniversary year only.
    const isCurrent = start === current.start;
    capPaid = isCurrent ? settings.real_cap_paid_seed : 0;
    postCapFeesPaid = isCurrent ? settings.real_post_cap_fees_paid_seed : 0;
    dealsThisYear = 0;
    cappedOnDate = capPaid >= settings.real_cap_amount ? start : null;
  };

  for (const deal of sorted) {
    const dealDate = deal.date.slice(0, 10);

    // Legacy path: closed before the agent joined REAL.
    if (joinDate && dealDate < joinDate) {
      const agentShare = deal.gci * legacyPct;
      breakdowns.push({
        id: deal.id,
        date: dealDate,
        gci: deal.gci,
        preJoin: true,
        preCapGci: 0,
        postCapGci: 0,
        companyDollar: 0,
        agentShare,
        fees: { postCap: 0, cbr: 0, beop: 0, signup: 0, total: 0 },
        agentNet: agentShare,
      });
      continue;
    }

    // Advance to the anniversary window containing this deal.
    if (!windowStart || dealDate >= windowEnd) {
      const w = anniversaryWindow(joinDate, dealDate);
      resetYear(w.start, w.end);
    }
    dealsThisYear++;

    // ── Cap split: how much of this deal's company dollar fits pre-cap? ──
    const wantedTake = deal.gci * REAL_COMPANY_DOLLAR_RATE;
    const capRoom = Math.max(0, settings.real_cap_amount - capPaid);
    const take = Math.min(wantedTake, capRoom);
    const preCapGci = REAL_COMPANY_DOLLAR_RATE > 0 ? take / REAL_COMPANY_DOLLAR_RATE : 0;
    const postCapGci = Math.max(0, deal.gci - preCapGci);
    capPaid += take;
    if (cappedOnDate === null && capPaid >= settings.real_cap_amount && settings.real_cap_amount > 0) {
      cappedOnDate = dealDate;
    }

    const agentShare =
      preCapGci * settings.real_pre_cap_agent_pct +
      postCapGci * settings.real_post_cap_agent_pct;

    // ── Fees ──
    // Post-cap flat fee: charged on any deal with a post-cap portion; Elite
    // rate applies once cumulative post-cap fees reached the threshold
    // BEFORE this deal (crossing deal pays the full fee).
    let postCapFee = 0;
    if (postCapGci > 0) {
      const eliteBefore = postCapFeesPaid >= settings.real_elite_threshold;
      postCapFee = eliteBefore ? settings.real_elite_fee : settings.real_post_cap_fee;
      postCapFeesPaid += postCapFee;
    }
    const cbr = settings.real_cbr_fee;
    const beop = dealsThisYear <= 3 ? settings.real_beop_annual / 3 : 0;
    let signup = 0;
    if (!signupCharged && (!joinDate || dealDate < addYears(joinDate, 1))) {
      signup = settings.real_signup_fee;
      signupCharged = true;
    }

    const feesTotal = postCapFee + cbr + beop + signup;
    breakdowns.push({
      id: deal.id,
      date: dealDate,
      gci: deal.gci,
      preJoin: false,
      preCapGci,
      postCapGci,
      companyDollar: take,
      agentShare,
      fees: { postCap: postCapFee, cbr, beop, signup, total: feesTotal },
      agentNet: agentShare - feesTotal,
    });
  }

  // Cap state must describe the CURRENT anniversary window even when the
  // last processed deal (or none) belongs to an earlier one.
  if (windowStart !== current.start) {
    resetYear(current.start, current.end);
    // Deals already processed can still fall inside the current window when
    // resetYear was never advanced past them (e.g. zero post-join deals) —
    // resetYear() above zeroed state, so re-accumulate from breakdowns.
    for (const b of breakdowns) {
      if (!b.preJoin && b.date >= current.start && b.date < current.end) {
        capPaid += b.companyDollar;
        postCapFeesPaid += b.fees.postCap;
        if (cappedOnDate === null && capPaid >= settings.real_cap_amount && settings.real_cap_amount > 0) {
          cappedOnDate = b.date;
        }
      }
    }
  }

  return {
    deals: breakdowns,
    capState: {
      anniversaryStart: current.start,
      anniversaryEnd: current.end,
      capAmount: settings.real_cap_amount,
      capPaid,
      capRemaining: Math.max(0, settings.real_cap_amount - capPaid),
      capped: settings.real_cap_amount > 0 && capPaid >= settings.real_cap_amount,
      cappedOnDate,
      postCapFeesPaid,
      eliteActive: postCapFeesPaid >= settings.real_elite_threshold,
    },
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/** Sum a result over a date window (both optional, YYYY-MM-DD, start
 *  inclusive / end exclusive). Use the calendar year for YTD surfaces. */
export function aggregateRealComp(
  settings: RealCompSettings,
  result: RealCompResult,
  windowStart?: string,
  windowEnd?: string,
): RealCompAggregate {
  let gci = 0;
  let agentShare = 0;
  let fees = 0;
  let agentNet = 0;
  let dealCount = 0;
  for (const d of result.deals) {
    if (windowStart && d.date < windowStart) continue;
    if (windowEnd && d.date >= windowEnd) continue;
    gci += d.gci;
    agentShare += d.agentShare;
    fees += d.fees.total;
    agentNet += d.agentNet;
    dealCount++;
  }
  return {
    gci,
    agentShare,
    fees,
    agentNet,
    dealCount,
    effectiveAgentPct: gci > 0 ? agentNet / gci : settings.real_pre_cap_agent_pct,
  };
}

// ── Analytic simulation (scenarios / projections — no deal list) ─────────────

export interface RealSimulationInput {
  /** Hypothetical annual GCI (single anniversary year). */
  annualGci: number;
  /** Expected deal count for that GCI (drives per-deal fees). */
  dealCount: number;
  /** Charge the Year-1 sign-up fee? */
  isYearOne?: boolean;
}

/** Aggregate REAL waterfall on a hypothetical year — same math as the
 *  per-deal engine under a uniform-deal assumption. For projections and
 *  what-if scenarios where no deal list exists. */
export function simulateRealCompensation(
  settings: RealCompSettings,
  input: RealSimulationInput,
): RealCompAggregate {
  const { annualGci, dealCount } = input;
  if (annualGci <= 0 || dealCount <= 0) {
    return {
      gci: Math.max(0, annualGci),
      agentShare: 0,
      fees: 0,
      agentNet: 0,
      dealCount: Math.max(0, dealCount),
      effectiveAgentPct: settings.real_pre_cap_agent_pct,
    };
  }

  const companyDollar = Math.min(annualGci * REAL_COMPANY_DOLLAR_RATE, settings.real_cap_amount);
  const preCapGci = companyDollar / REAL_COMPANY_DOLLAR_RATE;
  const postCapGci = Math.max(0, annualGci - preCapGci);
  const agentShare =
    preCapGci * settings.real_pre_cap_agent_pct +
    postCapGci * settings.real_post_cap_agent_pct;

  // Post-cap deals under the uniform assumption; Elite flips mid-sequence.
  const postCapDeals = Math.round(dealCount * (postCapGci / annualGci));
  const dealsToElite =
    settings.real_post_cap_fee > 0
      ? Math.ceil(settings.real_elite_threshold / settings.real_post_cap_fee)
      : 0;
  const fullFeeDeals = Math.min(postCapDeals, dealsToElite);
  const eliteDeals = Math.max(0, postCapDeals - fullFeeDeals);
  const postCapFees =
    fullFeeDeals * settings.real_post_cap_fee + eliteDeals * settings.real_elite_fee;

  const cbrFees = dealCount * settings.real_cbr_fee;
  const beopFees = (Math.min(3, dealCount) / 3) * settings.real_beop_annual;
  const signup = input.isYearOne ? settings.real_signup_fee : 0;
  const fees = postCapFees + cbrFees + beopFees + signup;
  const agentNet = agentShare - fees;

  return {
    gci: annualGci,
    agentShare,
    fees,
    agentNet,
    dealCount,
    effectiveAgentPct: agentNet / annualGci,
  };
}

// ── Plan-aware facade (THE integration point for every surface) ──────────────
//
// Everything that used to call `computeAgentGross(...) − computeTxFees(...)`
// calls THIS instead. For `simple_split` the math is byte-identical to the
// legacy chain; for `real` it routes through the waterfall above. Callers
// keep applying `monthly_brokerage_fee` themselves (it is plan-independent
// and month-scaled differently per surface — ×12 annual vs ×monthsElapsed).

/** Settings slice for the plan facade: REAL fields + the legacy split/cap/fee
 *  fields the simple path needs. */
export type CompSettingsSlice = RealCompSettings &
  Pick<
    UserSettings,
    | "post_cap_threshold_gci"
    | "post_cap_agent_pct"
    | "post_cap_brokerage_pct"
    | "tx_fee_rate_pct"
    | "tx_fee_annual_cap"
  >;

export interface PlanGrossOptions {
  /** Closed deals ({date, gci}) — enables the EXACT per-deal REAL path.
   *  Without them the REAL path falls back to the analytic simulation. */
  deals?: RealDealInput[];
  /** Expected deal count for analytic fee modeling when `deals` is absent
   *  (projections, hypothetical GCI). */
  dealCount?: number;
  /** Reference date, YYYY-MM-DD. Anchors the anniversary window. */
  asOf?: string;
  /** Aggregation window over the deals path (e.g. calendar YTD). */
  windowStart?: string;
  windowEnd?: string;
}

export interface PlanGrossResult {
  plan: CompPlan;
  /** Agent income after plan splits AND plan-level fees (REAL: post-cap/CBR/
   *  BEOP/sign-up; simple: tx fees), BEFORE monthly_brokerage_fee. */
  grossAfterPlan: number;
  /** Agent share after splits, BEFORE plan fees — for waterfall displays
   *  ("agent gross" line). grossAfterPlan = shareBeforePlanFees − planFees. */
  shareBeforePlanFees: number;
  /** Plan-level fees (REAL: post-cap + CBR + BEOP + sign-up; simple: tx fees). */
  planFees: number;
  /** grossAfterPlan / gci — the plan-aware replacement for getAgentPct()
   *  on labels and downstream scalar math. */
  effectiveAgentPct: number;
  /** REAL cap progress; null on simple_split. */
  capState: RealCapState | null;
}

/** Rough average GCI per deal used ONLY when a REAL-plan caller can supply
 *  neither deals nor a deal count (kept overt so reviewers can challenge it). */
const FALLBACK_AVG_DEAL_GCI = 15_000;

export function computePlanGross(
  settings: CompSettingsSlice,
  gci: number,
  opts: PlanGrossOptions = {},
): PlanGrossResult {
  if (settings.comp_plan !== "real") {
    // Legacy chain — byte-identical to the historical
    // computeAgentGross(...) − computeTxFees(...) call sites.
    const { agentGross } = computeAgentGross(
      gci,
      settings.split_preset,
      settings.post_cap_threshold_gci,
      settings.post_cap_agent_pct,
      settings.post_cap_brokerage_pct,
    );
    const txFees = computeTxFees(gci, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap);
    const grossAfterPlan = agentGross - txFees;
    return {
      plan: "simple_split",
      grossAfterPlan,
      shareBeforePlanFees: agentGross,
      planFees: txFees,
      effectiveAgentPct: gci > 0 ? grossAfterPlan / gci : SPLIT_PRESET_AGENT_PCT[settings.split_preset] ?? 0.8,
      capState: null,
    };
  }

  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  if (opts.deals && opts.deals.length > 0) {
    // Exact path: run the waterfall over real deals.
    const result = computeRealCompensation(settings, opts.deals, asOf);
    const agg = aggregateRealComp(settings, result, opts.windowStart, opts.windowEnd);
    return {
      plan: "real",
      grossAfterPlan: agg.agentNet,
      shareBeforePlanFees: agg.agentShare,
      planFees: agg.fees,
      effectiveAgentPct: agg.effectiveAgentPct,
      capState: result.capState,
    };
  }

  // Analytic path: hypothetical / projected GCI with no deal list.
  const isYearOne = anniversaryWindow(settings.real_join_date, asOf).yearIndex === 0;
  const dealCount =
    opts.dealCount ?? Math.max(1, Math.round(gci / FALLBACK_AVG_DEAL_GCI));
  const sim = simulateRealCompensation(settings, {
    annualGci: gci,
    dealCount,
    isYearOne,
  });
  // Cap state is still reportable without deals (seed-only).
  const capState = computeRealCompensation(settings, [], asOf).capState;
  return {
    plan: "real",
    grossAfterPlan: sim.agentNet,
    shareBeforePlanFees: sim.agentShare,
    planFees: sim.fees,
    effectiveAgentPct: sim.effectiveAgentPct,
    capState,
  };
}

/** Plan-aware split label for display surfaces (persona context, profile,
 *  forecast/report waterfall rows). Replaces the `p(\d+)_(\d+)` regex and
 *  getAgentPct() label sites, which have no meaning under `real`. */
export function describeSplit(
  settings: CompSettingsSlice,
  effectiveAgentPct?: number,
): string {
  if (settings.comp_plan !== "real") {
    const pct = Math.round((SPLIT_PRESET_AGENT_PCT[settings.split_preset] ?? 0.8) * 100);
    return `${pct}/${100 - pct}`;
  }
  const eff = effectiveAgentPct ?? settings.real_pre_cap_agent_pct;
  return `REAL plan (~${Math.round(eff * 100)}% effective)`;
}
