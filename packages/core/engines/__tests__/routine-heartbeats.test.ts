/**
 * Routine heartbeats (2026-11-02): which unattended jobs have gone quiet.
 * Finn and Owen were deleted some time after 2026-07-29 and nothing noticed
 * for three months; the outreach detector's last AI call was 2026-10-28
 * although it is scheduled daily.
 */
import { describe, expect, it } from "vitest";
import { ROUTINE_REGISTRY, heartbeatAlertLines, heartbeatReport, type HeartbeatRow } from "../routine-heartbeats";

const NOW = new Date("2026-11-02T11:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const beat = (routine_id: string, h: number, outcome = "ok", note: string | null = null): HeartbeatRow => ({ routine_id, finished_at: hoursAgo(h), outcome, note });

const REG = [
  { id: "cron:daily", name: "Daily job", expectedEveryHours: 30 },
  { id: "routine:finn", name: "Finn (Mon/Thu)", expectedEveryHours: 120 },
  { id: "routine:iris", name: "Iris", expectedEveryHours: 30, paused: true },
];

describe("states", () => {
  it("ok inside the window, overdue past it, never when no beat, paused never overdue", () => {
    const r = heartbeatReport(REG, [beat("cron:daily", 20), beat("routine:finn", 150)], NOW);
    expect(r.statuses.map((s) => [s.id, s.state])).toEqual([
      ["cron:daily", "ok"], ["routine:finn", "overdue"], ["routine:iris", "paused"],
    ]);
    expect(r.attention.map((s) => s.id)).toEqual(["routine:finn"]);
  });

  it("no beat at all is 'never' and needs attention", () => {
    const r = heartbeatReport(REG, [], NOW);
    expect(r.statuses.find((s) => s.id === "cron:daily")!.state).toBe("never");
    expect(r.attention.map((s) => s.id)).toEqual(["cron:daily", "routine:finn"]);
  });

  it("the latest beat wins, and an error outcome needs attention even when recent", () => {
    const r = heartbeatReport(REG, [beat("cron:daily", 50), beat("cron:daily", 2, "error", "boom"), beat("cron:daily", 40)], NOW);
    const s = r.statuses.find((x) => x.id === "cron:daily")!;
    expect(s.state).toBe("error");
    expect(s.hoursSince).toBe(2);
    expect(s.note).toBe("boom");
  });
});

describe("the alert lines", () => {
  it("say what is wrong, when it last finished, and how often it is expected", () => {
    const r = heartbeatReport(REG, [beat("routine:finn", 150), beat("cron:daily", 1, "error", "usage limit")], NOW);
    const lines = heartbeatAlertLines(r);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Daily job: last run ended in an error: usage limit\. It last finished 2026-11-02 10:00 UTC \(0 days ago, expected every 1\.3 days\)\.$/);
    expect(lines[1]).toMatch(/^Finn \(Mon\/Thu\): overdue\. It last finished .* \(6\.3 days ago, expected every 5 days\)\.$/);
  });

  it("a routine that never reported says so", () => {
    const lines = heartbeatAlertLines(heartbeatReport([REG[0]], [], NOW));
    expect(lines[0]).toBe("Daily job: no heartbeat on record. It has never reported.");
  });
});

describe("the registry", () => {
  it("every routine has a positive cadence and a distinct id", () => {
    expect(ROUTINE_REGISTRY.every((r) => r.expectedEveryHours > 0)).toBe(true);
    expect(new Set(ROUTINE_REGISTRY.map((r) => r.id)).size).toBe(ROUTINE_REGISTRY.length);
  });
});
