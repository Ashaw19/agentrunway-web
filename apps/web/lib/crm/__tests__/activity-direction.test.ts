import { describe, it, expect } from "vitest";
import { activityDirection } from "../activity-direction";
import { ACTIVITY_TYPE_LABELS } from "@/lib/types/database";
import type { ActivityType } from "@/lib/types/database";

describe("activityDirection", () => {
  it("classifies agent outreach as outbound", () => {
    expect(activityDirection("call")).toBe("outbound");
    expect(activityDirection("email")).toBe("outbound");
    expect(activityDirection("text")).toBe("outbound");
  });

  it("classifies two-way engagement moments as inbound", () => {
    expect(activityDirection("showing")).toBe("inbound");
    expect(activityDirection("meeting")).toBe("inbound");
    expect(activityDirection("offer")).toBe("inbound");
  });

  it("classifies a note as note", () => {
    expect(activityDirection("note")).toBe("note");
  });

  it("returns a defined direction for every ActivityType (no silent gap)", () => {
    for (const t of Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]) {
      expect(["outbound", "inbound", "note"]).toContain(activityDirection(t));
    }
  });
});
