/**
 * The opportunity types CRM buttons send to /api/ai/draft-outreach.
 *
 * Kept in one module (types only, safe for client components) so
 * lib/crm/__tests__/outreach-draft-actions.test.ts can check every one
 * against DRAFTABLE_OUTREACH_TYPES. A type the route rejects is a 400 and an
 * error toast on every click.
 */

import type { BriefingItemType } from "@/lib/engines/crm-analytics-engine";
import type { OutreachOpportunityType } from "@/lib/types/database";

/**
 * Briefing rows that get a Draft button, and the touchpoint each drafts.
 * Only types where a personalised email genuinely adds value are included.
 *
 * No relationship_decay ("going quiet"): it fires for any stage, leads and
 * active buyers included, and every draftable check-in prompt is written to
 * a past client. The row keeps its log-contact and dismiss actions.
 */
export const BRIEFING_TO_OUTREACH_TYPE: Partial<Record<BriefingItemType, OutreachOpportunityType>> = {
  birthday_today:           "birthday",
  birthday_soon:            "birthday",
  closing_anniversary:      "closing_anniversary",
  mortgage_renewal_due:     "mortgage_renewal_due",
  mortgage_renewal_window:  "mortgage_renewal_window",
  past_client_check_in:     "past_client_check_in",
  timeframe_approaching:    "timeframe_approaching",
  property_value_milestone: "property_value_milestone",
};

/** The client detail panel's AI Actions buttons. */
export const CLIENT_PANEL_DRAFT_TYPES = {
  referral:    "referral_ask",
  checkIn:     "past_client_check_in",
  review:      "review_request",
  anniversary: "closing_anniversary",
} as const satisfies Record<string, OutreachOpportunityType>;
