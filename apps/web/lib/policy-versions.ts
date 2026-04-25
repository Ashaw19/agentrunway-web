// ============================================================================
// lib/policy-versions.ts
// ----------------------------------------------------------------------------
// Single source of truth for the current published version of each policy.
// Bump the date string here whenever you ship a material edit to a policy
// page; the in-app PolicyUpdateBanner compares these values against each
// user's acceptances in the policy_acceptances table and prompts re-consent
// on first login after any change.
//
// Format: YYYY-MM-DD (must match LAST_UPDATED on each policy page).
// ============================================================================

export type PolicyType =
  | "terms"
  | "privacy"
  | "acceptable_use"
  | "cookie";

export const POLICY_VERSIONS: Record<PolicyType, string> = {
  terms:          "2026-04-25",
  privacy:        "2026-04-25",
  acceptable_use: "2026-04-25",
  cookie:         "2026-04-25",
};

export const POLICY_LABELS: Record<PolicyType, string> = {
  terms:          "Terms of Service",
  privacy:        "Privacy Policy",
  acceptable_use: "Acceptable Use Policy",
  cookie:         "Cookie Policy",
};

export const POLICY_PATHS: Record<PolicyType, string> = {
  terms:          "/terms",
  privacy:        "/privacy",
  acceptable_use: "/acceptable-use",
  cookie:         "/cookie-policy",
};

/** Full ordered list of policy types (matches the order shown in the banner). */
export const POLICY_TYPES: PolicyType[] = [
  "terms",
  "privacy",
  "acceptable_use",
  "cookie",
];

/**
 * Compare a user's accepted versions to the current published versions.
 * Returns the policies that have a newer version than what the user has
 * accepted (or has never accepted at all). Empty array = fully up to date.
 */
export function policiesNeedingAcceptance(
  acceptedVersions: Partial<Record<PolicyType, string>>,
): PolicyType[] {
  return POLICY_TYPES.filter((type) => {
    const accepted = acceptedVersions[type];
    return accepted !== POLICY_VERSIONS[type];
  });
}
