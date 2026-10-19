import { describe, it, expect } from "vitest";
import * as core from "@agent-runway/core/lib/client-groups";
import * as web from "../client-groups";
import { computeHouseholdActivityIds } from "../resolve-deal-clients";

/**
 * Per-client deal totals and the Clients table sort moved to core on
 * 2026-10-19 so the phone's Clients list ranks top clients by the same rule.
 * The web paths must stay the very same functions, not copies that can drift.
 */
describe("lib/crm/client-groups re-exports core", () => {
  it("every export is core's own", () => {
    expect(Object.keys(web).sort()).toEqual(Object.keys(core).sort());
    for (const key of Object.keys(core) as (keyof typeof core)[]) {
      expect(web[key]).toBe(core[key]);
    }
  });

  it("resolve-deal-clients' computeHouseholdActivityIds is core's", () => {
    expect(computeHouseholdActivityIds).toBe(core.computeHouseholdActivityIds);
  });

  it("the table opens sorted by Lifetime GCI, highest first", () => {
    expect(web.CLIENTS_TABLE_DEFAULT_SORT).toEqual({ col: "gci", dir: "desc" });
  });
});
