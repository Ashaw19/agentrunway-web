// HST/GST helpers — deliberate copy for mcp-server Edge Function.
//
// KEEP IN SYNC with packages/core/engines/hst-engine.ts
// If the canonical helpers there change, mirror the changes here in the same
// commit. Deno edge functions cannot import workspace packages directly, so
// this copy exists per Pattern P-2 (deliberate-duplicate guarded by review).
//
// See:
//   - /Users/b/.claude/.../memory/feedback_data_consistency_protocol.md
//   - apps/web/supabase/functions/mcp-server/lib/README.md
//
// ESTIMATE ONLY — Not legal or tax advice.

export interface HSTCollectedInputs {
  ytdGCI: number;
  hstRate: number;
  isRegistered: boolean;
  brokerageWithholdsHst: boolean;
}

export interface HSTNetOwingInputs {
  hstCollected: number;
  hstPaidOnExpenses: number;
}

export type HSTThresholdSeverity =
  | "already_registered"
  | "collected_below_threshold"
  | "collected_at_threshold"
  | "collected_above_threshold";

/**
 * Mirrors packages/core/engines/hst-engine.ts:computeHSTCollected exactly.
 * See that file's header for the formula derivation.
 */
export function computeHSTCollected(inputs: HSTCollectedInputs): number {
  const { ytdGCI, hstRate, isRegistered, brokerageWithholdsHst } = inputs;

  if (!isRegistered) return 0;
  if (brokerageWithholdsHst) return 0;
  if (ytdGCI <= 0 || hstRate <= 0) return 0;

  return ytdGCI * hstRate;
}

/**
 * Mirrors packages/core/engines/hst-engine.ts:computeHSTNetOwing exactly.
 */
export function computeHSTNetOwing(inputs: HSTNetOwingInputs): number {
  const { hstCollected, hstPaidOnExpenses } = inputs;
  return hstCollected - hstPaidOnExpenses;
}

/**
 * Province-to-rate map — mirrors
 * packages/core/engines/canadian-tax-engine.ts:gstHstRate.
 *
 * KEEP IN SYNC. Verified against CRA publication
 * canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/
 * charge-collect-which-rate.html.
 *
 * Nova Scotia: reduced from 15% to 14% effective Apr 1, 2025 (CRA Notice 342).
 */
export function gstHstRate(province: string): number {
  switch (province) {
    case "ontario": return 0.13;
    case "novaScotia": return 0.14;
    case "newBrunswick": return 0.15;
    case "newfoundland": return 0.15;
    case "princeEdwardIsland": return 0.15;
    case "quebec": return 0.14975;
    case "saskatchewan": return 0.05;
    default: return 0.05;
  }
}

/**
 * Human-readable label — mirrors
 * packages/core/engines/canadian-tax-engine.ts:gstHstLabel.
 */
export function gstHstLabel(province: string): string {
  switch (province) {
    case "ontario":
    case "novaScotia":
    case "newBrunswick":
    case "newfoundland":
    case "princeEdwardIsland":
      return "HST";
    case "quebec":
      return "GST + QST";
    case "saskatchewan":
      return "GST";
    default:
      return "GST";
  }
}
