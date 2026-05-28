/**
 * Business Identity — canonical field schema, option lists, and helpers.
 *
 * Shared between the web Settings "Business Identity" section
 * (`apps/web/app/(app)/settings/settings-content.tsx`, Part B of the AI
 * Profile card) and the mobile Business Identity screen
 * (`apps/mobile/app/(app)/profile/business-identity.tsx`).
 *
 * Lifted from the web Settings file during the mobile Settings parity
 * build (audit gap #14, follow-up to PR #157 — Voice Quiz). Before this
 * lift the option lists lived only in the web JSX — porting to mobile
 * would have duplicated six predefined lists with no enforcement, so a
 * future content edit (e.g. adding a new market_type) on either side
 * would silently drift. This module is the single source of truth.
 *
 * Both surfaces import the option arrays and `computeBusinessIdentityCompleted`
 * from here. Display labels live on the lists; surface-specific styling
 * (Tailwind class strings on web, theme tokens on mobile) stays with each
 * surface.
 *
 * The `BusinessIdentity` row type itself remains in
 * `packages/core/types/database.ts` to keep the row-shape canonical
 * location stable. This module imports it for convenience.
 */
import type { BusinessIdentity } from "../types/database";

// ── Option lists ───────────────────────────────────────────────────────────
//
// Each list is a tuple of `{ val, label }` so the consumer can map straight
// over without re-declaring labels. `val` is the persisted DB value; `label`
// is the human-readable English string (mobile + i18n overlay these from
// translation files; web consumes labels directly).

export interface BusinessIdentityOption<V extends string = string> {
  val: V;
  label: string;
}

/** Specialty — multi-select. Maps to BusinessIdentity.specialty (string[]). */
export const SPECIALTY_OPTIONS: BusinessIdentityOption<
  "buyer" | "listing" | "both"
>[] = [
  { val: "buyer", label: "Buyer-Focused" },
  { val: "listing", label: "Listing-Focused" },
  { val: "both", label: "Both" },
];

/** Market type — multi-select. Maps to BusinessIdentity.market_type (string[]). */
export const MARKET_TYPE_OPTIONS: BusinessIdentityOption<
  "urban_condo" | "suburban" | "rural" | "luxury" | "new_construction"
>[] = [
  { val: "urban_condo", label: "Urban / Condo" },
  { val: "suburban", label: "Suburban" },
  { val: "rural", label: "Rural" },
  { val: "luxury", label: "Luxury" },
  { val: "new_construction", label: "New Construction" },
];

/** Business model — single-select. Maps to BusinessIdentity.business_model (string). */
export const BUSINESS_MODEL_OPTIONS: BusinessIdentityOption<
  "solo_agent" | "team_lead" | "team_member"
>[] = [
  { val: "solo_agent", label: "Solo Agent" },
  { val: "team_lead", label: "Team Lead" },
  { val: "team_member", label: "Team Member" },
];

/**
 * Lead sources — multi-select. Maps to BusinessIdentity.lead_sources (string[]).
 *
 * This is the *Business Identity* lead source list (5 high-level archetypes
 * agents use to describe how they generate business). It is NOT the per-client
 * `lead_source` list on the `clients` table — that one is 35+ specific channels
 * (e.g. "Zillow Premier", "open house", "door knocking"). The two lists serve
 * different purposes and intentionally do not overlap.
 */
export const LEAD_SOURCE_OPTIONS: BusinessIdentityOption<
  "referrals" | "sphere" | "cold_outreach" | "social" | "farming"
>[] = [
  { val: "referrals", label: "Referrals" },
  { val: "sphere", label: "Sphere of Influence" },
  { val: "cold_outreach", label: "Cold Outreach" },
  { val: "social", label: "Social Media" },
  { val: "farming", label: "Geo Farming" },
];

/** Years experience — single-select. Maps to BusinessIdentity.years_experience (string). */
export const YEARS_EXPERIENCE_OPTIONS: BusinessIdentityOption<
  "0_2" | "3_5" | "5_10" | "10_plus"
>[] = [
  { val: "0_2", label: "0–2" },
  { val: "3_5", label: "3–5" },
  { val: "5_10", label: "5–10" },
  { val: "10_plus", label: "10+" },
];

/** Average price range — single-select. Maps to BusinessIdentity.avg_price_range (string). */
export const PRICE_RANGE_OPTIONS: BusinessIdentityOption<
  "under_300k" | "300_500k" | "500_800k" | "800k_1m" | "over_1m"
>[] = [
  { val: "under_300k", label: "Under $300K" },
  { val: "300_500k", label: "$300–500K" },
  { val: "500_800k", label: "$500–800K" },
  { val: "800k_1m", label: "$800K–$1M" },
  { val: "over_1m", label: "$1M+" },
];

// ── Empty / default state ──────────────────────────────────────────────────

/**
 * Canonical empty BusinessIdentity. Surfaces that need to render the
 * "not yet configured" state start here. Mirrors the inline default in
 * `apps/web/app/(app)/settings/settings-content.tsx` so a user opening
 * Settings vs. opening Mobile Business Identity sees identical defaults
 * pre-save.
 */
export const EMPTY_BUSINESS_IDENTITY: BusinessIdentity = {
  completed: false,
  specialty: [],
  market_type: [],
  business_model: "",
  lead_sources: [],
  years_experience: "",
  avg_price_range: "",
};

// ── Completion derivation ──────────────────────────────────────────────────

/**
 * The `completed` flag on BusinessIdentity is *derived*, not persisted by
 * the user directly. The rule (from the web settings handler `saveAiProfile`):
 * a BI is "completed" if the user has selected at least one specialty,
 * at least one market_type, and a business_model.
 *
 * Lifted here so web and mobile cannot drift. Adding new "required" fields
 * to the completion definition (e.g. lead_sources, years_experience) is a
 * single-edit change here — both surfaces update on next save.
 *
 * Source of truth: previous body of `saveAiProfile` in
 * `apps/web/app/(app)/settings/settings-content.tsx`. Behaviour preserved
 * byte-for-byte; any rule changes here re-derive `completed` on every
 * subsequent save.
 */
export function computeBusinessIdentityCompleted(bi: BusinessIdentity): boolean {
  return !!(
    bi.specialty.length > 0 &&
    bi.market_type.length > 0 &&
    bi.business_model
  );
}

// ── Re-exports for ergonomic single-import ─────────────────────────────────

export type { BusinessIdentity };
