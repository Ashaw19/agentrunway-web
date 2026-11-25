/**
 * Routine heartbeats (2026-11-02): which unattended jobs have gone quiet.
 * Finn and Owen were deleted some time after 2026-07-29 and nothing noticed
 * for three months; the outreach detector's last AI call was 2026-10-28
 * although it is scheduled daily.
 */
import { describe, expect, it } from "vitest";
import {
  ROUTINE_REGISTRY, alertedProblems, alertSignature, heartbeatAlertLines, heartbeatReport,
  routineCheckNote, shouldEmailAlert, type HeartbeatRow,
} from "../routine-heartbeats";

const NOW = new Date("2026-11-02T11:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const beat = (routine_id: string, h: number, outcome = "ok", note: string | null = null): HeartbeatRow => ({ routine_id, finished_at: hoursAgo(h), outcome, note });

const REG = [
  { id: "cron:daily", name: "Daily job", expectedEveryHours: 30, watchFrom: "2026-10-01" },
  { id: "routine:finn", name: "Finn (Mon/Thu)", expectedEveryHours: 120, watchFrom: "2026-10-01" },
  { id: "routine:iris", name: "Iris", expectedEveryHours: 30, watchFrom: "2026-10-01", paused: true },
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

describe("a routine whose first run isn't due yet", () => {
  // Vera: monthly (33-day window), registered 2026-11-04, first run 2026-12-01.
  const VERA = { id: "routine:vera", name: "Vera", expectedEveryHours: 33 * 24, watchFrom: "2026-11-04" };

  it("is waiting, not never, and isn't an alert", () => {
    const r = heartbeatReport([VERA], [], new Date("2026-11-25T11:00:00Z"));
    expect(r.statuses[0].state).toBe("waiting");
    expect(r.attention).toEqual([]);
  });

  it("becomes never once a full cadence has passed with no heartbeat", () => {
    const r = heartbeatReport([VERA], [], new Date("2026-12-08T11:00:00Z"));
    expect(r.statuses[0].state).toBe("never");
    expect(r.attention.map((s) => s.id)).toEqual(["routine:vera"]);
  });

  it("the live registry raises nothing on 2026-11-25 when everything but Vera has reported", () => {
    const now = new Date("2026-11-25T11:00:00Z");
    const beats = ROUTINE_REGISTRY.filter((r) => r.id !== "routine:vera").map((r) => ({
      routine_id: r.id, finished_at: new Date(now.getTime() - 3_600_000).toISOString(), outcome: "ok",
    }));
    expect(heartbeatReport(ROUTINE_REGISTRY, beats, now).attention).toEqual([]);
  });
});

describe("when to email", () => {
  const overdue = heartbeatReport(REG, [beat("cron:daily", 2), beat("routine:finn", 150)], NOW);
  const twoProblems = heartbeatReport(REG, [beat("routine:finn", 150)], NOW); // daily never + finn overdue
  const fine = heartbeatReport(REG, [beat("cron:daily", 2), beat("routine:finn", 2)], NOW);
  const emailedAgo = (days: number, report = overdue) => ({ at: hoursAgo(days * 24), note: routineCheckNote(report, true) });

  it("nothing wrong: no email", () => {
    expect(shouldEmailAlert(fine, null, NOW)).toBe(false);
  });

  it("a problem never emailed about: email", () => {
    expect(shouldEmailAlert(overdue, null, NOW)).toBe(true);
  });

  it("the same problem emailed yesterday: no email; a week later: a reminder", () => {
    expect(shouldEmailAlert(overdue, emailedAgo(1), NOW)).toBe(false);
    expect(shouldEmailAlert(overdue, emailedAgo(6.9), NOW)).toBe(false);
    expect(shouldEmailAlert(overdue, emailedAgo(7), NOW)).toBe(true);
  });

  it("a new problem on top of an old one: email at once", () => {
    expect(shouldEmailAlert(twoProblems, emailedAgo(1), NOW)).toBe(true);
  });

  it("one of two problems fixed: no email", () => {
    expect(shouldEmailAlert(overdue, emailedAgo(1, twoProblems), NOW)).toBe(false);
  });

  it("the same routine in a new state (overdue, then error) is news", () => {
    const err = heartbeatReport(REG, [beat("cron:daily", 2), beat("routine:finn", 1, "error", "x")], NOW);
    expect(shouldEmailAlert(err, emailedAgo(1), NOW)).toBe(true);
  });

  it("a note from before this field counts as nothing emailed", () => {
    expect(alertedProblems("1 needing attention; emailed=true").size).toBe(0);
    expect(shouldEmailAlert(overdue, { at: hoursAgo(24), note: "1 needing attention; emailed=true" }, NOW)).toBe(true);
  });

  it("the note round-trips what was emailed", () => {
    expect(alertSignature(twoProblems)).toBe("cron:daily:never,routine:finn:overdue");
    expect([...alertedProblems(routineCheckNote(twoProblems, true))].sort()).toEqual(["cron:daily:never", "routine:finn:overdue"]);
    expect(alertedProblems(routineCheckNote(twoProblems, false)).size).toBe(0);
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
  it("every routine has a positive cadence, a valid watchFrom day and a distinct id", () => {
    expect(ROUTINE_REGISTRY.every((r) => r.expectedEveryHours > 0)).toBe(true);
    expect(ROUTINE_REGISTRY.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.watchFrom) && !Number.isNaN(Date.parse(r.watchFrom)))).toBe(true);
    expect(new Set(ROUTINE_REGISTRY.map((r) => r.id)).size).toBe(ROUTINE_REGISTRY.length);
  });
});
