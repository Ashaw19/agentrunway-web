/**
 * Every CRM button that POSTs to /api/ai/draft-outreach must send a type the
 * route accepts (Andrew, 2026-10-06).
 *
 * "Ask for Referral", "Request Review" and the "going quiet" briefing row's
 * Draft button all sent types missing from DRAFTABLE_OUTREACH_TYPES, so every
 * click was a 400 and an error toast. The UI types now live in one module so
 * this test can check them against the route's list.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));

import { DRAFTABLE_OUTREACH_TYPES } from "@/lib/ai/draft-services";
import {
  BRIEFING_TO_OUTREACH_TYPE,
  CLIENT_PANEL_DRAFT_TYPES,
} from "../outreach-draft-actions";

describe("CRM draft buttons only send draftable types", () => {
  it.each(Object.entries(BRIEFING_TO_OUTREACH_TYPE))(
    "briefing %s → %s",
    (_briefingType, outreachType) => {
      expect(DRAFTABLE_OUTREACH_TYPES).toContain(outreachType);
    },
  );

  it.each(Object.entries(CLIENT_PANEL_DRAFT_TYPES))(
    "client panel %s → %s",
    (_button, outreachType) => {
      expect(DRAFTABLE_OUTREACH_TYPES).toContain(outreachType);
    },
  );

  it("has no Draft button on a 'going quiet' row", () => {
    // relationship_decay fires for any stage (leads, active buyers, past
    // clients). Every draftable check-in prompt is written to a past client,
    // so a draft for a lead would claim a purchase that never happened.
    expect(BRIEFING_TO_OUTREACH_TYPE.relationship_decay).toBeUndefined();
  });
});
