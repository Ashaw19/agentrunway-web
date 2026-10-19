import { describe, expect, it } from "vitest";
import {
  CONSENT_LAPSING_TYPE,
  HOLD_OPPORTUNITY_TYPE,
  LATER_TOMORROW_HOUR,
  LATER_TONIGHT_HOUR,
  activeLaterUntil,
  dismissChoicesFor,
  dismissalRowsFrom,
  isHeld,
  laterChoices,
  laterUntil,
  opportunityKey,
  stopUntil,
  withoutDismissed,
  withoutDismissedOrHeld,
  type DismissalRow,
} from "../suggestion-dismissals";

/**
 * Suggestion rules shared by every surface (web Flight Control, the nightly
 * drafts, the phone, Flight Crew, MCP). A skip covers one occurrence; a
 * Later or Stop hold covers the client, whatever the reason (a hold row's
 * opportunity_type is 'any'). Atlantic wall-clock times throughout.
 */

const rows = (r: Partial<DismissalRow>[]): DismissalRow[] =>
  r.map((x) => ({ client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-19", ...x }));

describe("constants", () => {
  it("pins the shared values", () => {
    expect(HOLD_OPPORTUNITY_TYPE).toBe("any");
    expect(CONSENT_LAPSING_TYPE).toBe("consent_lapsing");
    expect(LATER_TONIGHT_HOUR).toBe(19);
    expect(LATER_TOMORROW_HOUR).toBe(8);
  });
});

describe("opportunityKey", () => {
  it("keys on client, type and trigger date", () => {
    expect(opportunityKey({ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }))
      .toBe("c1|idle_client|2026-10-01");
  });

  it("normalises a timestamp-shaped trigger date to the date", () => {
    expect(opportunityKey({ client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-12T00:00:00+00:00" }))
      .toBe("c1|birthday|2026-10-12");
  });
});

describe("withoutDismissed", () => {
  it("a skip covers one occurrence only", () => {
    const c = [
      { client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" },
      { client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-23" },
    ];
    expect(withoutDismissed(c, [{ ...c[0] }])).toEqual([c[1]]); // old row, no kind
  });

  it("reads a row with no kind, a null kind and kind 'skip' the same way", () => {
    const c = [{ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }];
    const base = { ...c[0] };
    expect(withoutDismissed(c, [base])).toEqual([]);
    expect(withoutDismissed(c, [{ ...base, kind: null }])).toEqual([]);
    expect(withoutDismissed(c, [{ ...base, kind: "skip", until: null }])).toEqual([]);
  });

  it("does not drop a candidate for a later or stop row, even on a matching key", () => {
    const c = [{ client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-19" }];
    expect(withoutDismissed(c, [{ ...c[0], kind: "later", until: "2026-10-19T22:00:00Z" }])).toEqual(c);
    expect(withoutDismissed(c, [{ ...c[0], kind: "stop", until: "2027-01-19T04:00:00Z" }])).toEqual(c);
  });

  it("returns a copy when there is nothing to drop", () => {
    const c = [{ client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-23" }];
    const out = withoutDismissed(c, []);
    expect(out).toEqual(c);
    expect(out).not.toBe(c);
  });
});

describe("isHeld", () => {
  it("later hides every type until its time", () => {
    const r = rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]);
    expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T21:59:00Z"))).toBe(true);
    expect(isHeld("c1", "birthday", r, new Date("2026-10-19T22:00:00Z"))).toBe(false);
  });

  it("stop hides everything but a consent-lapsing notice", () => {
    const r = rows([{ kind: "stop", until: "2027-01-19T04:00:00Z" }]);
    expect(isHeld("c1", "idle_client", r, new Date("2026-10-19T12:00:00Z"))).toBe(true);
    expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T12:00:00Z"))).toBe(false);
  });

  it("a stop ends at its until", () => {
    const r = rows([{ kind: "stop", until: "2027-01-19T04:00:00Z" }]);
    expect(isHeld("c1", "idle_client", r, new Date("2027-01-19T03:59:59Z"))).toBe(true);
    expect(isHeld("c1", "idle_client", r, new Date("2027-01-19T04:00:00Z"))).toBe(false);
  });

  it("holds only the client it was made for", () => {
    const r = rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]);
    expect(isHeld("c2", "birthday", r, new Date("2026-10-19T12:00:00Z"))).toBe(false);
  });

  it("a skip row, a row with no kind, or a row with no until never holds", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isHeld("c1", "birthday", rows([{ kind: "skip" }]), now)).toBe(false);
    expect(isHeld("c1", "birthday", rows([{}]), now)).toBe(false);
    expect(isHeld("c1", "birthday", rows([{ kind: "later", until: null }]), now)).toBe(false);
    expect(isHeld("c1", "birthday", rows([{ kind: "stop" }]), now)).toBe(false);
    expect(isHeld("c1", "birthday", rows([{ kind: "later", until: "not a date" }]), now)).toBe(false);
  });

  it("an expired hold next to a live one still holds", () => {
    const r = rows([
      { kind: "later", until: "2026-10-18T22:00:00Z", trigger_date: "2026-10-18" },
      { kind: "later", until: "2026-10-19T22:00:00Z" },
    ]);
    expect(isHeld("c1", "birthday", r, new Date("2026-10-19T12:00:00Z"))).toBe(true);
  });

  it("a live later still holds a consent-lapsing notice when a stop sits beside it", () => {
    const r = rows([
      { kind: "stop", until: "2027-01-19T04:00:00Z", trigger_date: "2026-10-01" },
      { kind: "later", until: "2026-10-19T22:00:00Z" },
    ]);
    expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T12:00:00Z"))).toBe(true);
    expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T22:00:00Z"))).toBe(false);
  });
});

describe("withoutDismissedOrHeld", () => {
  const cand = (client_id: string, opportunity_type: string, trigger_date: string) => ({
    client_id, opportunity_type, trigger_date, context: {},
  });

  it("drops skipped occurrences and held clients, keeps the rest", () => {
    const candidates = [
      cand("c1", "birthday", "2026-10-23"),      // held by a later
      cand("c2", "idle_client", "2026-10-01"),   // skipped
      cand("c2", "birthday", "2026-10-24"),      // other occurrence of c2: stays
      cand("c3", "consent_lapsing", "2026-11-01"), // c3 stopped: notice stays
      cand("c3", "idle_client", "2026-10-02"),   // c3 stopped: gone
    ];
    const r: DismissalRow[] = [
      { client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-19", kind: "later", until: "2026-10-19T22:00:00Z" },
      { client_id: "c2", opportunity_type: "idle_client", trigger_date: "2026-10-01" },
      { client_id: "c3", opportunity_type: "any", trigger_date: "2026-10-19", kind: "stop", until: "2027-01-19T04:00:00Z" },
    ];
    const out = withoutDismissedOrHeld(candidates, r, new Date("2026-10-19T12:00:00Z"));
    expect(out).toEqual([candidates[2], candidates[3]]);
  });

  it("brings a client back once the later time passes", () => {
    const candidates = [cand("c1", "birthday", "2026-10-23")];
    const r = rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]);
    expect(withoutDismissedOrHeld(candidates, r, new Date("2026-10-19T21:59:59Z"))).toEqual([]);
    expect(withoutDismissedOrHeld(candidates, r, new Date("2026-10-19T22:00:00Z"))).toEqual(candidates);
  });
});

describe("activeLaterUntil", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("is the until of the client's live later, as stored", () => {
    const r = rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]);
    expect(activeLaterUntil("c1", r, now)).toBe("2026-10-19T22:00:00Z");
  });

  it("is null for a different client, an expired later, a stop or a skip", () => {
    expect(activeLaterUntil("c2", rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]), now)).toBeNull();
    expect(activeLaterUntil("c1", rows([{ kind: "later", until: "2026-10-19T12:00:00Z" }]), now)).toBeNull();
    expect(activeLaterUntil("c1", rows([{ kind: "stop", until: "2027-01-19T04:00:00Z" }]), now)).toBeNull();
    expect(activeLaterUntil("c1", rows([{ kind: "skip" }]), now)).toBeNull();
    expect(activeLaterUntil("c1", [], now)).toBeNull();
  });

  it("picks the latest when more than one is live", () => {
    const r = rows([
      { kind: "later", until: "2026-10-19T16:00:00Z", trigger_date: "2026-10-18" },
      { kind: "later", until: "2026-10-20T11:00:00Z" },
    ]);
    expect(activeLaterUntil("c1", r, now)).toBe("2026-10-20T11:00:00Z");
  });
});

describe("laterChoices", () => {
  it("no 'tonight' at or after 19:00 Atlantic", () => {
    expect(laterChoices(new Date("2026-10-19T21:59:00Z"))).toEqual(["in_an_hour", "tonight", "tomorrow"]); // 18:59 ADT
    expect(laterChoices(new Date("2026-10-19T22:00:00Z"))).toEqual(["in_an_hour", "tomorrow"]);
  });

  it("asked at 19:30 Atlantic there is no 'tonight'", () => {
    expect(laterChoices(new Date("2026-10-19T22:30:00Z"))).toEqual(["in_an_hour", "tomorrow"]); // 19:30 ADT
  });

  it("reads Atlantic time, not UTC: 10 pm UTC in winter is 18:00 AST, still before tonight", () => {
    expect(laterChoices(new Date("2026-11-02T22:00:00Z"))).toEqual(["in_an_hour", "tonight", "tomorrow"]); // 18:00 AST
    expect(laterChoices(new Date("2026-11-02T23:00:00Z"))).toEqual(["in_an_hour", "tomorrow"]); // 19:00 AST
  });

  it("offers 'tonight' in the small hours", () => {
    expect(laterChoices(new Date("2026-10-19T04:00:00Z"))).toEqual(["in_an_hour", "tonight", "tomorrow"]); // 01:00 ADT
  });
});

describe("laterUntil", () => {
  it("later times", () => {
    const now = new Date("2026-10-19T15:10:00Z");
    expect(laterUntil("in_an_hour", now).toISOString()).toBe("2026-10-19T16:10:00.000Z");
    expect(laterUntil("tonight", now).toISOString()).toBe("2026-10-19T22:00:00.000Z");
    expect(laterUntil("tomorrow", now).toISOString()).toBe("2026-10-20T11:00:00.000Z");
  });

  it("tomorrow across the DST change is 08:00 AST", () => {
    expect(laterUntil("tomorrow", new Date("2026-10-31T23:00:00Z")).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("tonight on the day clocks fall back is still 19:00 on the wall", () => {
    // Sun Nov 1 2026, 10:00 AST. 19:00 AST = 23:00Z.
    expect(laterUntil("tonight", new Date("2026-11-01T14:00:00Z")).toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });

  it("tomorrow across the spring change is 08:00 ADT", () => {
    // Sat Mar 13 2027, 20:00 AST; clocks spring forward at 02:00 on Sun Mar 14.
    expect(laterUntil("tomorrow", new Date("2027-03-14T00:00:00Z")).toISOString()).toBe("2027-03-14T11:00:00.000Z");
  });

  it("tomorrow chosen after midnight UTC but before midnight Atlantic is the next Atlantic day", () => {
    // Mon Oct 19 2026, 22:00 ADT (Oct 20 01:00 UTC). Tomorrow is Tue Oct 20, 08:00 ADT.
    expect(laterUntil("tomorrow", new Date("2026-10-20T01:00:00Z")).toISOString()).toBe("2026-10-20T11:00:00.000Z");
  });

  it("tomorrow at the month and year end rolls the calendar", () => {
    // Thu Dec 31 2026, 22:00 AST -> Fri Jan 1 2027, 08:00 AST = 12:00Z.
    expect(laterUntil("tomorrow", new Date("2027-01-01T02:00:00Z")).toISOString()).toBe("2027-01-01T12:00:00.000Z");
  });

  it("in an hour is an hour, whatever the clock does", () => {
    // 01:30 ADT on the night clocks fall back: an hour on is 3600 s of real time, not a wall-clock hour.
    expect(laterUntil("in_an_hour", new Date("2026-11-01T04:30:00Z")).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("does not move the Date it was given", () => {
    const now = new Date("2026-10-19T15:10:00Z");
    laterUntil("tomorrow", now);
    expect(now.toISOString()).toBe("2026-10-19T15:10:00.000Z");
  });
});

describe("stopUntil", () => {
  it("stop durations are calendar months, Atlantic midnight", () => {
    expect(stopUntil("3_months", new Date("2026-11-30T15:00:00Z")).toISOString()).toBe("2027-02-28T04:00:00.000Z");
    expect(stopUntil("6_months", new Date("2026-10-19T15:00:00Z")).toISOString()).toBe("2027-04-19T03:00:00.000Z");
  });

  it("starts the same calendar day N months on", () => {
    expect(stopUntil("3_months", new Date("2026-10-19T15:00:00Z")).toISOString()).toBe("2027-01-19T04:00:00.000Z");
  });

  it("counts the Atlantic day, not the UTC day, as today", () => {
    // Mon Oct 19 2026, 22:00 ADT is already Oct 20 in UTC. Today is the 19th.
    expect(stopUntil("3_months", new Date("2026-10-20T01:00:00Z")).toISOString()).toBe("2027-01-19T04:00:00.000Z");
  });

  it("clamps to the end of a shorter month, leap years included", () => {
    expect(stopUntil("3_months", new Date("2027-11-29T15:00:00Z")).toISOString()).toBe("2028-02-29T04:00:00.000Z");
    expect(stopUntil("3_months", new Date("2027-11-30T15:00:00Z")).toISOString()).toBe("2028-02-29T04:00:00.000Z");
    expect(stopUntil("6_months", new Date("2026-08-31T15:00:00Z")).toISOString()).toBe("2027-02-28T04:00:00.000Z");
    expect(stopUntil("3_months", new Date("2026-08-31T15:00:00Z")).toISOString()).toBe("2026-11-30T04:00:00.000Z");
  });

  it("rolls into the next year", () => {
    expect(stopUntil("6_months", new Date("2026-12-15T15:00:00Z")).toISOString()).toBe("2027-06-15T03:00:00.000Z");
    expect(stopUntil("3_months", new Date("2026-12-15T15:00:00Z")).toISOString()).toBe("2027-03-15T03:00:00.000Z");
  });
});

describe("dismissChoicesFor", () => {
  it("consent-lapsing cards can't be stopped", () => {
    expect(dismissChoicesFor("idle_client")).toEqual(["already_talked", "later", "skip", "stop"]);
    expect(dismissChoicesFor("consent_lapsing")).toEqual(["already_talked", "later", "skip"]);
  });
});

describe("dismissalRowsFrom (rows as the database returns them)", () => {
  const NOW = new Date("2026-10-19T15:00:00Z");

  it("keeps the columns it knows and reads the kinds", () => {
    expect(dismissalRowsFrom([
      { id: "d1", client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: "skip", until: null, dismissed_at: "2026-10-19T12:00:00+00:00" },
      { id: "d2", client_id: "c2", opportunity_type: "any", trigger_date: "2026-10-19", kind: "later", until: "2026-10-19T22:00:00+00:00", dismissed_at: "2026-10-19T13:00:00+00:00" },
      { id: "d3", client_id: "c3", opportunity_type: "any", trigger_date: "2026-10-19", kind: "stop", until: "2027-01-19T04:00:00+00:00" },
    ])).toEqual([
      { id: "d1", client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: "skip", until: null, dismissed_at: "2026-10-19T12:00:00+00:00" },
      { id: "d2", client_id: "c2", opportunity_type: "any", trigger_date: "2026-10-19", kind: "later", until: "2026-10-19T22:00:00+00:00", dismissed_at: "2026-10-19T13:00:00+00:00" },
      { id: "d3", client_id: "c3", opportunity_type: "any", trigger_date: "2026-10-19", kind: "stop", until: "2027-01-19T04:00:00+00:00", dismissed_at: null },
    ]);
  });

  it("reads a kind it doesn't know as a skip, never as a hold", () => {
    const [row] = dismissalRowsFrom([
      { client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: "mute", until: "2027-01-01T00:00:00Z" },
    ]);
    expect(row.kind).toBeNull();
    expect(isHeld("c1", "birthday", [row], NOW)).toBe(false);
    expect(withoutDismissed([{ client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25" }], [row])).toEqual([]);
  });

  it("drops a row without its key, and reads odd values as missing", () => {
    expect(dismissalRowsFrom([
      { client_id: null, opportunity_type: "birthday", trigger_date: "2026-10-25" },
      { client_id: "c1", opportunity_type: 7, trigger_date: "2026-10-25" },
      { client_id: "c1", opportunity_type: "birthday" },
      null,
      "row",
      { id: 4, client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: 1, until: 5, dismissed_at: {} },
    ])).toEqual([
      { client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: null, until: null, dismissed_at: null },
    ]);
  });

  it("no rows, or a failed read, is an empty list", () => {
    expect(dismissalRowsFrom(null)).toEqual([]);
    expect(dismissalRowsFrom(undefined)).toEqual([]);
    expect(dismissalRowsFrom([])).toEqual([]);
  });
});
