import { describe, expect, it } from "vitest";
import {
  dailyBriefingPipelineChip,
  greetingTag,
  noUrgentClientActionsLine,
  paceStatement,
  todayZoneLayout,
} from "../today-zone";
import { pipelineDepthStatus } from "@agent-runway/core/types/database";
import {
  DEFAULT_HIDDEN,
  DEFAULT_ORDER,
  TODAY_CARD_IDS,
  resolveDashboardLayout,
  type CardId,
} from "@/app/(app)/dashboard/card-registry";

describe("greetingTag: keeps the voice, drops the pace claim", () => {
  const statuses = ["ahead", "behind", "no-goal"];
  it("never claims pace or track for any state", () => {
    for (const status of statuses) {
      for (const deals of [0, 4]) {
        expect(greetingTag(status, deals)).not.toMatch(/pace|on track|behind|ahead/i);
      }
    }
  });
  it("keeps the zero-deals line", () => {
    expect(greetingTag("behind", 0)).toContain("Zero on the board");
  });
});

describe("dailyBriefingPipelineChip: counts pipeline deals, not clients", () => {
  const deal = (stage: string, extra: Record<string, unknown> = {}) => ({ stage, ...extra });

  it("is Empty only with no deals and no listings", () => {
    expect(dailyBriefingPipelineChip([], 0)).toEqual({ label: "Empty", depth: "empty" });
  });

  it("is Light at one or two deals, and says how many", () => {
    expect(dailyBriefingPipelineChip([deal("lead")], 0)).toEqual({ label: "Light (1 deal)", depth: "light" });
    expect(dailyBriefingPipelineChip([deal("lead"), deal("firm")], 0)).toEqual({ label: "Light (2 deals)", depth: "light" });
  });

  it("states the count at three or more", () => {
    const five = ["lead", "showing", "offer", "conditional", "firm"].map((s) => deal(s));
    expect(dailyBriefingPipelineChip(five, 0)).toEqual({ label: "5 deals", depth: "healthy" });
  });

  it("does not say Empty beside a KPI card that shows listings", () => {
    expect(dailyBriefingPipelineChip([], 2)).toEqual({ label: "Light (2 listings)", depth: "light" });
  });

  it("drops closed, lost and collapsed rows; an undated deal counts", () => {
    const rows = [
      deal("closed"),
      deal("lost"),
      deal("firm", { condition_status: "collapsed" }),
      deal("lead", { expected_close_date: null }),
    ];
    expect(dailyBriefingPipelineChip(rows, 0)).toEqual({ label: "Light (1 deal)", depth: "light" });
  });
});

describe("pipelineDepthStatus: the one rule behind the chip and the opportunity read", () => {
  it("is empty only with no deals and no listings", () => {
    expect(pipelineDepthStatus(0)).toBe("empty");
    expect(pipelineDepthStatus(0, 0)).toBe("empty");
    expect(pipelineDepthStatus(0, 1)).toBe("light");
  });
  it("doesn't let listings lift the deal thresholds", () => {
    expect(pipelineDepthStatus(2, 5)).toBe("light");
    expect(pipelineDepthStatus(3)).toBe("healthy");
  });
  it("can't read as empty after a failed read", () => {
    expect(pipelineDepthStatus(Number.POSITIVE_INFINITY)).toBe("healthy");
    expect(pipelineDepthStatus(0, Number.POSITIVE_INFINITY)).toBe("light");
  });
});

describe("noUrgentClientActionsLine", () => {
  it("says what is empty and does not read as all clear", () => {
    expect(noUrgentClientActionsLine()).toMatch(/no urgent client actions/i);
    expect(noUrgentClientActionsLine()).not.toMatch(/all clear/i);
  });
});

describe("paceStatement: the page's one statement of pace", () => {
  const base = { goalGCI: 200_000, ytdGCI: 100_000, ytdDealCount: 4 };

  it("is absent without a goal", () => {
    expect(paceStatement({ ...base, goalGCI: 0, pacePercent: 0 })).toBeNull();
  });

  it("states behind pace from the engine's figures", () => {
    const s = paceStatement({ ...base, pacePercent: -34.2 })!;
    expect(s.state).toBe("behind");
    expect(s.title).toBe("Behind pace on your annual goal");
    expect(s.body).toBe("You're at 66% of expected pace. $100,000 to go, about 4 more deals at your average size.");
  });

  it("states behind pace at any distance, not only past 30%", () => {
    expect(paceStatement({ ...base, pacePercent: -8 })!.state).toBe("behind");
  });

  it("states ahead of pace", () => {
    const s = paceStatement({ ...base, pacePercent: 12 })!;
    expect(s.state).toBe("ahead");
    expect(s.title).toBe("Ahead of pace on your annual goal");
    expect(s.body).toBe("You're at 112% of expected pace. $100,000 to go, about 4 more deals at your average size.");
  });

  it("states on pace when the figure rounds to 100%", () => {
    const s = paceStatement({ ...base, pacePercent: 0.3 })!;
    expect(s.state).toBe("on-pace");
    expect(s.title).toBe("On pace for your annual goal");
    expect(s.body).toContain("You're at 100% of expected pace.");
  });

  it("drops the deal count when there is no average deal size yet", () => {
    const s = paceStatement({ goalGCI: 200_000, ytdGCI: 0, ytdDealCount: 0, pacePercent: -100 })!;
    expect(s.body).toBe("You're at 0% of expected pace. $200,000 to go.");
  });

  it("says one deal in the singular", () => {
    const s = paceStatement({ goalGCI: 200_000, ytdGCI: 150_000, ytdDealCount: 3, pacePercent: -5 })!;
    expect(s.body).toContain("about 1 more deal at your average size");
  });

  it("states a reached goal instead of a distance", () => {
    const s = paceStatement({ goalGCI: 200_000, ytdGCI: 215_000, ytdDealCount: 9, pacePercent: 40 })!;
    expect(s.state).toBe("goal-reached");
    expect(s.title).toBe("Annual goal reached");
    expect(s.body).toBe("You've closed $215,000, which is $15,000 over your goal.");
  });
});

describe("todayZoneLayout", () => {
  const base = {
    briefingHasContent: true,
    tasksHasContent: true,
    briefingHidden: false,
    tasksHidden: false,
    customizeMode: false,
  };

  it("draws both cards when both have content", () => {
    expect(todayZoneLayout(base)).toEqual({ cards: ["client_briefing", "tasks"], showNoUrgentLine: false });
  });

  it("collapses to one line, not a blank box, when there is nothing", () => {
    expect(todayZoneLayout({ ...base, briefingHasContent: false, tasksHasContent: false })).toEqual({
      cards: [],
      showNoUrgentLine: true,
    });
  });

  it("gives the Checklist the zone when the briefing is empty, with the line above it", () => {
    expect(todayZoneLayout({ ...base, briefingHasContent: false })).toEqual({ cards: ["tasks"], showNoUrgentLine: true });
  });

  it("gives the briefing the zone when the Checklist is empty", () => {
    expect(todayZoneLayout({ ...base, tasksHasContent: false })).toEqual({ cards: ["client_briefing"], showNoUrgentLine: false });
  });

  it("honours a hidden card and says nothing for a hidden briefing", () => {
    expect(todayZoneLayout({ ...base, briefingHidden: true })).toEqual({ cards: ["tasks"], showNoUrgentLine: false });
    expect(todayZoneLayout({ ...base, tasksHidden: true })).toEqual({ cards: ["client_briefing"], showNoUrgentLine: false });
    expect(todayZoneLayout({ ...base, briefingHidden: true, tasksHidden: true, briefingHasContent: false })).toEqual({
      cards: [],
      showNoUrgentLine: false,
    });
  });

  it("keeps both cards in Customize so they can be hidden or shown", () => {
    expect(
      todayZoneLayout({ ...base, customizeMode: true, briefingHidden: true, tasksHasContent: false }),
    ).toEqual({ cards: ["client_briefing", "tasks"], showNoUrgentLine: false });
  });
});

describe("resolveDashboardLayout: saved layouts keep working", () => {
  it("defaults when nothing is saved", () => {
    const { order, hidden } = resolveDashboardLayout(null);
    expect(order).toEqual(DEFAULT_ORDER);
    expect([...hidden]).toEqual(DEFAULT_HIDDEN);
  });

  it("the sortable order never holds a Today card, so a saved order cannot push Today down", () => {
    for (const id of TODAY_CARD_IDS) expect(DEFAULT_ORDER).not.toContain(id);
    const { order } = resolveDashboardLayout({
      order: ["kpi_row", "where_you_stand", "client_briefing", "morning_brief", "tasks"] as CardId[],
      hidden: [],
    });
    for (const id of TODAY_CARD_IDS) expect(order).not.toContain(id);
  });

  it("keeps the agent's order for the other cards and adds any missing ones at the end", () => {
    const { order } = resolveDashboardLayout({
      order: ["time_value", "tasks", "kpi_row", "client_briefing", "morning_brief"] as CardId[],
      hidden: [],
    });
    expect(order.slice(0, 3)).toEqual(["time_value", "kpi_row", "morning_brief"]);
    expect(new Set(order)).toEqual(new Set(DEFAULT_ORDER));
    expect(order).toHaveLength(DEFAULT_ORDER.length);
  });

  it("keeps a hidden Today card hidden, and every other hidden card", () => {
    const { hidden } = resolveDashboardLayout({
      order: ["kpi_row"] as CardId[],
      hidden: ["tasks", "kpi_row", "time_value"] as CardId[],
    });
    expect(hidden.has("tasks")).toBe(true);
    expect(hidden.has("kpi_row")).toBe(true);
    expect(hidden.has("time_value")).toBe(true);
    expect(hidden.has("client_briefing")).toBe(false);
  });

  it("still drops cards that moved to other pages, as before", () => {
    const { order } = resolveDashboardLayout({ order: ["trends", "kpi_row"] as CardId[], hidden: [] });
    expect(order).not.toContain("trends");
  });

  it("survives a malformed saved value", () => {
    const bad = { order: "nope", hidden: 7 } as unknown as Parameters<typeof resolveDashboardLayout>[0];
    const { order, hidden } = resolveDashboardLayout(bad);
    expect(order).toEqual(DEFAULT_ORDER);
    expect([...hidden]).toEqual(DEFAULT_HIDDEN);
  });
});
