/**
 * HST / GST Engine — Canonical Calculator Tests
 * ================================================
 * Tests for packages/core/engines/hst-engine.ts.
 *
 * Created 2026-04-22 as part of Audit 1 D-4: the chat route was returning two
 * different HST numbers in the same response (ytdGCI * rate vs
 * ytdGCI * agentPct * rate). These tests pin the canonical formula and the
 * brokerage-withholds / unregistered zero-return contracts so no caller can
 * silently regress.
 *
 * Rules the tests enforce:
 *   - HST collected = ytdGCI * hstRate (full invoiced GCI, not agent split)
 *   - Unregistered agents -> 0 collected
 *   - Brokerage-withholds-HST -> 0 agent-side cashflow
 *   - Zero / negative GCI -> 0 collected
 *   - Net owing = collected - ITCs (signed, refund returns negative)
 *   - Threshold classification uses CRA's $30,000 small-supplier limit over
 *     four consecutive calendar quarters
 */

import { describe, it, expect } from "vitest";
import {
  computeHSTCollected,
  computeHSTNetOwing,
  classifyHSTThreshold,
} from "../hst-engine";

// Published CRA rates used in multi-province tests.
// Mirrors canadian-tax-engine.ts:gstHstRate — verified against CRA
// canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/
// charge-collect-which-rate.html.
const RATE_ONTARIO = 0.13;
const RATE_ATLANTIC = 0.15;    // NB, NL, PE
const RATE_NOVA_SCOTIA = 0.14; // effective Apr 1 2025 (CRA Notice 342)
const RATE_QUEBEC = 0.14975;   // GST + QST combined
const RATE_GST_ONLY = 0.05;    // AB, BC, MB, SK, territories

// ── computeHSTCollected — zero-return contracts ────────────────────────────

describe("computeHSTCollected — unregistered agents", () => {
  it("returns 0 when isRegistered is false, regardless of GCI", () => {
    expect(computeHSTCollected({
      ytdGCI: 100_000,
      hstRate: RATE_ONTARIO,
      isRegistered: false,
      brokerageWithholdsHst: false,
    })).toBe(0);
  });

  it("returns 0 when unregistered even with non-zero GCI in a GST-only province", () => {
    expect(computeHSTCollected({
      ytdGCI: 50_000,
      hstRate: RATE_GST_ONLY,
      isRegistered: false,
      brokerageWithholdsHst: false,
    })).toBe(0);
  });
});

describe("computeHSTCollected — brokerage withholds HST", () => {
  it("returns 0 when brokerageWithholdsHst is true even if registered", () => {
    // The brokerage holds and remits HST directly to CRA. The agent's
    // personal cash-flow view never sees the HST portion.
    expect(computeHSTCollected({
      ytdGCI: 200_000,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: true,
    })).toBe(0);
  });

  it("returns 0 under brokerage-withholds in Atlantic 15% province", () => {
    expect(computeHSTCollected({
      ytdGCI: 150_000,
      hstRate: RATE_ATLANTIC,
      isRegistered: true,
      brokerageWithholdsHst: true,
    })).toBe(0);
  });
});

describe("computeHSTCollected — zero / negative GCI", () => {
  it("returns 0 for zero GCI", () => {
    expect(computeHSTCollected({
      ytdGCI: 0,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBe(0);
  });

  it("returns 0 for negative GCI", () => {
    expect(computeHSTCollected({
      ytdGCI: -1000,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBe(0);
  });

  it("returns 0 for zero hstRate", () => {
    expect(computeHSTCollected({
      ytdGCI: 100_000,
      hstRate: 0,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBe(0);
  });
});

// ── computeHSTCollected — registered + self-remit (the happy path) ─────────

describe("computeHSTCollected — registered + self-remit by province", () => {
  it("Ontario 13% on $100k GCI -> $13,000", () => {
    expect(computeHSTCollected({
      ytdGCI: 100_000,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(13_000, 2);
  });

  it("New Brunswick (Atlantic) 15% on $85k GCI -> $12,750", () => {
    expect(computeHSTCollected({
      ytdGCI: 85_000,
      hstRate: RATE_ATLANTIC,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(12_750, 2);
  });

  it("Nova Scotia 14% on $60k GCI -> $8,400 (post Apr 2025 reduction)", () => {
    expect(computeHSTCollected({
      ytdGCI: 60_000,
      hstRate: RATE_NOVA_SCOTIA,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(8_400, 2);
  });

  it("Alberta / GST-only 5% on $120k GCI -> $6,000", () => {
    expect(computeHSTCollected({
      ytdGCI: 120_000,
      hstRate: RATE_GST_ONLY,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(6_000, 2);
  });

  it("Quebec 14.975% on $75k GCI -> $11,231.25 (GST + QST combined)", () => {
    expect(computeHSTCollected({
      ytdGCI: 75_000,
      hstRate: RATE_QUEBEC,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(11_231.25, 2);
  });
});

// ── Critical: D-4 regression pin ───────────────────────────────────────────
// These tests exist specifically to prevent re-introduction of the chat
// self-contradiction bug (ytdGCI * agentPct * hstRate). The helper MUST
// multiply the full invoiced GCI — not the agent's split portion.

describe("computeHSTCollected — D-4 regression pin: full invoiced GCI", () => {
  it("uses full invoiced GCI, not the agent split (ON 13%, $10k GCI, 70/30 split irrelevant)", () => {
    // If someone were to pass `gci * 0.70` thinking the split matters,
    // they'd get 0.70 * 10000 * 0.13 = $910. The canonical helper must
    // return 10000 * 0.13 = $1300 regardless of any split logic the caller
    // is doing elsewhere.
    expect(computeHSTCollected({
      ytdGCI: 10_000,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBe(1_300);
  });

  it("matches ytdGCI * hstRate exactly (no rounding inside the helper)", () => {
    // Helper returns the raw product — any rounding is the caller's job.
    // This pins the contract so downstream surfaces (dashboard, chat,
    // reports, MCP) can agree to round the same way at the boundary.
    expect(computeHSTCollected({
      ytdGCI: 12_345.67,
      hstRate: RATE_ONTARIO,
      isRegistered: true,
      brokerageWithholdsHst: false,
    })).toBeCloseTo(12_345.67 * 0.13, 6);
  });
});

// ── computeHSTNetOwing ──────────────────────────────────────────────────────

describe("computeHSTNetOwing", () => {
  it("returns positive (owing) when collected exceeds ITCs", () => {
    // $13k collected, $2k ITCs => $11k owing
    expect(computeHSTNetOwing({
      hstCollected: 13_000,
      hstPaidOnExpenses: 2_000,
    })).toBe(11_000);
  });

  it("returns negative (refund) when ITCs exceed collected", () => {
    // Rare but possible in a very expense-heavy year; the helper returns
    // the signed value so callers can display "refund" explicitly rather
    // than clamping at zero.
    expect(computeHSTNetOwing({
      hstCollected: 1_000,
      hstPaidOnExpenses: 2_500,
    })).toBe(-1_500);
  });

  it("returns zero when collected equals ITCs", () => {
    expect(computeHSTNetOwing({
      hstCollected: 5_000,
      hstPaidOnExpenses: 5_000,
    })).toBe(0);
  });

  it("treats unregistered / brokerage-withholds upstream as zero collected", () => {
    // If the caller already zeroed collected (via computeHSTCollected) then
    // passing it through net-owing with non-zero ITCs produces a negative
    // number — the caller's responsibility to interpret. This just pins
    // the contract.
    expect(computeHSTNetOwing({
      hstCollected: 0,
      hstPaidOnExpenses: 500,
    })).toBe(-500);
  });
});

// ── classifyHSTThreshold ────────────────────────────────────────────────────

describe("classifyHSTThreshold — CRA $30k small-supplier rule", () => {
  it("returns already_registered when the agent is registered", () => {
    // The threshold classification is informational for not-yet-registered
    // agents. Registered agents get a different severity label.
    expect(classifyHSTThreshold(true, 20_000)).toBe("already_registered");
    expect(classifyHSTThreshold(true, 50_000)).toBe("already_registered");
    expect(classifyHSTThreshold(true, 0)).toBe("already_registered");
  });

  it("returns collected_below_threshold below 90% of $30k ($27k)", () => {
    expect(classifyHSTThreshold(false, 0)).toBe("collected_below_threshold");
    expect(classifyHSTThreshold(false, 15_000)).toBe("collected_below_threshold");
    expect(classifyHSTThreshold(false, 26_999)).toBe("collected_below_threshold");
  });

  it("returns collected_at_threshold between 90% and 100% of $30k", () => {
    expect(classifyHSTThreshold(false, 27_000)).toBe("collected_at_threshold");
    expect(classifyHSTThreshold(false, 29_500)).toBe("collected_at_threshold");
    expect(classifyHSTThreshold(false, 29_999.99)).toBe("collected_at_threshold");
  });

  it("returns collected_above_threshold at and above $30k", () => {
    expect(classifyHSTThreshold(false, 30_000)).toBe("collected_above_threshold");
    expect(classifyHSTThreshold(false, 45_000)).toBe("collected_above_threshold");
    expect(classifyHSTThreshold(false, 100_000)).toBe("collected_above_threshold");
  });
});
