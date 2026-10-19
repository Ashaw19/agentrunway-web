import { describe, it, expect } from "vitest";
import {
  selectTopCandidates,
  clientLifetimeGci,
  MAX_TOP_OPPORTUNITIES,
} from "../top-opportunity-selection";

/**
 * Flight Control "Scan Now" card selection.
 *
 * Reported 2026-10-06: Scan never showed more than a card or two. Without a
 * fresh AI memory profile, idle past clients score 38 and multi-deal clients 52,
 * and the old selector dropped everything under 55, so 17 detected idle past
 * clients never surfaced. Strong signals still rank first; idle past clients
 * now fill the remaining slots instead of the page claiming "All caught up".
 */

const cand = (client_id: string, opportunity_type: string, score: number) => ({
  client_id,
  opportunity_type,
  trigger_date: "2026-10-01",
  context: { outreach_score: score },
});

const ids = (rows: { client_id: string; opportunity_type: string }[]) =>
  rows.map((r) => `${r.client_id}:${r.opportunity_type}`);

describe("selectTopCandidates", () => {
  it("backfills idle past clients when strong signals are short (the reported bug)", () => {
    const picked = selectTopCandidates(
      [cand("a", "closing_anniversary", 60), cand("b", "idle_client", 38), cand("c", "idle_client", 38)],
      new Map(),
    );
    expect(ids(picked)).toEqual(["a:closing_anniversary", "b:idle_client", "c:idle_client"]);
  });

  it("always ranks strong signals ahead of backfill", () => {
    const picked = selectTopCandidates(
      [cand("b", "idle_client", 38), cand("c", "multi_deal_milestone", 52), cand("a", "birthday", 70)],
      new Map(),
    );
    expect(ids(picked)).toEqual(["a:birthday", "c:multi_deal_milestone", "b:idle_client"]);
  });

  it("never backfills seasonal campaigns — those are broadcasts, not 'who to contact'", () => {
    const picked = selectTopCandidates(
      [cand("a", "seasonal_fall", 38), cand("b", "idle_client", 38)],
      new Map(),
    );
    expect(ids(picked)).toEqual(["b:idle_client"]);
  });

  it("keeps a seasonal card that earns the strong threshold on its own", () => {
    const picked = selectTopCandidates([cand("a", "seasonal_fall", 58)], new Map());
    expect(ids(picked)).toEqual(["a:seasonal_fall"]);
  });

  it("shows one card per client — their highest-scoring opportunity", () => {
    const picked = selectTopCandidates(
      [cand("a", "idle_client", 38), cand("a", "closing_anniversary", 60)],
      new Map(),
    );
    expect(ids(picked)).toEqual(["a:closing_anniversary"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => cand(`c${i}`, "idle_client", 38));
    expect(selectTopCandidates(many, new Map())).toHaveLength(MAX_TOP_OPPORTUNITIES);
  });

  it("breaks score ties by client lifetime GCI, highest first", () => {
    const picked = selectTopCandidates(
      [cand("low", "idle_client", 38), cand("high", "idle_client", 38), cand("none", "idle_client", 38)],
      new Map([["low", 4_000], ["high", 22_000]]),
    );
    expect(ids(picked)).toEqual(["high:idle_client", "low:idle_client", "none:idle_client"]);
  });

  it("does not reorder the caller's array", () => {
    const input = [cand("b", "idle_client", 38), cand("a", "birthday", 70)];
    selectTopCandidates(input, new Map());
    expect(ids(input)).toEqual(["b:idle_client", "a:birthday"]);
  });
});

describe("clientLifetimeGci", () => {
  it("sums GCI per client, skipping collapsed deals", () => {
    const map = clientLifetimeGci([
      { client_id: "a", gci: 8_000, condition_status: "firmed" },
      { client_id: "a", gci: "5000", condition_status: null },
      { client_id: "a", gci: 9_999, condition_status: "collapsed" },
      { client_id: "b", gci: null },
      { client_id: null, gci: 1_000 },
    ]);
    expect(map.get("a")).toBe(13_000);
    expect(map.has("b")).toBe(false);
  });
});

describe("sphere check-in cap (2026-10-07)", () => {
  it("never shows more than 2 sphere cards, even with empty slots", () => {
    const picked = selectTopCandidates(
      [
        cand("s1", "sphere_check_in", 30), cand("s2", "sphere_check_in", 30),
        cand("s3", "sphere_check_in", 30), cand("s4", "sphere_check_in", 30),
      ],
      new Map(),
    );
    expect(ids(picked)).toEqual(["s1:sphere_check_in", "s2:sphere_check_in"]);
  });

  it("ranks sphere below idle past clients", () => {
    const picked = selectTopCandidates(
      [cand("s1", "sphere_check_in", 30), cand("i1", "idle_client", 38), cand("l1", "lead_going_quiet", 60)],
      new Map(),
    );
    expect(ids(picked)).toEqual(["l1:lead_going_quiet", "i1:idle_client", "s1:sphere_check_in"]);
  });
});

/**
 * The day's handful (next_up_handful, phone dashboard Next up, 2026-10-19):
 * a client Flight Control picked stays until handled, so a higher-scoring
 * newcomer (a birthday entering its window) can't push them out tomorrow.
 * Pinned clients that are still candidates come first, in pin order, each
 * with their best candidate. TYPE_CAPS and the seasonal rule still apply.
 */
describe("pinned clients (the day's handful)", () => {
  const three = (score: number) => [cand("x1", "birthday", score), cand("x2", "birthday", score), cand("x3", "birthday", score)];
  const clientIds = (rows: { client_id: string }[]) => rows.map((r) => r.client_id);

  it("a pinned client keeps its place over a higher-scoring newcomer", () => {
    const c = [cand("new", "birthday", 80), cand("old", "idle_client", 38), ...three(50)];
    expect(selectTopCandidates(c, new Map(), 5, ["old"]).map((x) => x.client_id)).toContain("old");
    expect(selectTopCandidates(c, new Map(), 5, ["old"])[0].client_id).toBe("old");
  });

  it("a pinned client keeps a slot a newcomer would otherwise take", () => {
    const c = [cand("new", "birthday", 80), cand("x", "birthday", 70), cand("old", "idle_client", 38)];
    expect(clientIds(selectTopCandidates(c, new Map(), 2))).toEqual(["new", "x"]);
    expect(clientIds(selectTopCandidates(c, new Map(), 2, ["old"]))).toEqual(["old", "new"]);
  });

  it("pins come first in pin order, whatever their scores", () => {
    const c = [cand("a", "birthday", 80), cand("b", "idle_client", 38), cand("c", "lead_going_quiet", 60)];
    expect(clientIds(selectTopCandidates(c, new Map(), 5, ["b", "a"]))).toEqual(["b", "a", "c"]);
  });

  it("a pinned client gets their best candidate", () => {
    const c = [cand("a", "idle_client", 38), cand("a", "closing_anniversary", 60), cand("b", "birthday", 70)];
    expect(ids(selectTopCandidates(c, new Map(), 5, ["a"]))).toEqual(["a:closing_anniversary", "b:birthday"]);
  });

  it("pins still respect TYPE_CAPS", () => {
    const c = [
      cand("s1", "sphere_check_in", 30), cand("s2", "sphere_check_in", 30), cand("s3", "sphere_check_in", 30),
      cand("i1", "idle_client", 38),
    ];
    const picked = selectTopCandidates(c, new Map(), 5, ["s1", "s2", "s3"]);
    expect(ids(picked)).toEqual(["s1:sphere_check_in", "s2:sphere_check_in", "i1:idle_client"]);
  });

  it("a capped pinned client falls back to their next candidate", () => {
    const c = [
      cand("s1", "sphere_check_in", 30), cand("s2", "sphere_check_in", 30),
      cand("s3", "sphere_check_in", 30), cand("s3", "idle_client", 20),
    ];
    expect(ids(selectTopCandidates(c, new Map(), 5, ["s1", "s2", "s3"])))
      .toEqual(["s1:sphere_check_in", "s2:sphere_check_in", "s3:idle_client"]);
  });

  it("the seasonal rule applies to a pinned client", () => {
    const c = [cand("a", "seasonal_fall", 38), cand("b", "idle_client", 38)];
    expect(ids(selectTopCandidates(c, new Map(), 5, ["a"]))).toEqual(["b:idle_client"]);
  });

  it("a pin that is no longer a candidate is passed over", () => {
    const c = [cand("a", "birthday", 70), cand("b", "idle_client", 38)];
    expect(clientIds(selectTopCandidates(c, new Map(), 5, ["gone", "b"]))).toEqual(["b", "a"]);
  });

  it("more pins than slots: the first ones in pin order", () => {
    const c = [cand("a", "birthday", 70), cand("b", "idle_client", 38), cand("c", "idle_client", 38)];
    expect(clientIds(selectTopCandidates(c, new Map(), 2, ["c", "b", "a"]))).toEqual(["c", "b"]);
  });

  it("a repeated pin is one card", () => {
    const c = [cand("a", "birthday", 70), cand("b", "idle_client", 38)];
    expect(clientIds(selectTopCandidates(c, new Map(), 5, ["b", "b"]))).toEqual(["b", "a"]);
  });

  it("no slots, no cards", () => {
    expect(selectTopCandidates([cand("a", "birthday", 70)], new Map(), 0, ["a"])).toEqual([]);
  });
});
