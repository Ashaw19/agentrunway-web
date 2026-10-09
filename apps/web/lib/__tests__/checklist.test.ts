import { describe, it, expect } from "vitest";
import type { ContactTask } from "@/lib/types/database";
import {
  addDaysIso,
  attemptDescription,
  contactDescription,
  contactItemTitle,
  doneLabel,
  doneThisWeek,
  dueLabel,
  groupOpenItems,
  overdueLabel,
  todayLocalIso,
  weekStart,
} from "../checklist/checklist";

/**
 * Checklist page (2026-10-09): the existing task list (contact_tasks) given a
 * home. Dates are the browser's local time, so every Date here is built with
 * the local constructor and the tests pass in any host time zone.
 */

// Wednesday Oct 7 2026, 1 pm local.
const WED = new Date(2026, 9, 7, 13, 0);
const TODAY = "2026-10-07";

function task(id: string, over: Partial<ContactTask> = {}): ContactTask {
  return {
    id, user_id: "u", client_id: null, title: id, due_date: TODAY, priority: "normal",
    notes: null, completed_at: null, completed_via: null,
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
    ...over,
  };
}

describe("dates", () => {
  it("today is the local calendar day", () => {
    expect(todayLocalIso(WED)).toBe(TODAY);
    expect(todayLocalIso(new Date(2026, 9, 7, 23, 30))).toBe(TODAY); // late evening is still today
  });

  it("adds days across month ends and the November DST change", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("the week starts Monday at local midnight", () => {
    expect(weekStart(WED)).toEqual(new Date(2026, 9, 5));
    expect(weekStart(new Date(2026, 9, 11, 22, 0))).toEqual(new Date(2026, 9, 5)); // Sunday night
    expect(weekStart(new Date(2026, 9, 12, 0, 30))).toEqual(new Date(2026, 9, 12)); // Monday
  });
});

describe("groupOpenItems", () => {
  const items = [
    task("late", { due_date: "2026-10-05" }),
    task("today-normal", { created_at: "2026-10-02T12:00:00Z" }),
    task("today-high", { priority: "high", created_at: "2026-10-03T12:00:00Z" }),
    task("later", { due_date: "2026-10-09" }),
    task("finished", { completed_at: "2026-10-06T15:00:00Z" }),
  ];
  const g = groupOpenItems(items, TODAY);

  it("splits open items into overdue, today and coming up", () => {
    expect(g.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(g.today.map((t) => t.id)).toEqual(["today-high", "today-normal"]);
    expect(g.upcoming.map((t) => t.id)).toEqual(["later"]);
  });

  it("leaves done items out", () => {
    expect([...g.overdue, ...g.today, ...g.upcoming].some((t) => t.id === "finished")).toBe(false);
  });
});

describe("doneThisWeek", () => {
  const items = [
    task("mon", { completed_at: new Date(2026, 9, 5, 9, 0).toISOString(), completed_via: "call" }),
    task("tue", { completed_at: new Date(2026, 9, 6, 16, 0).toISOString(), completed_via: "done" }),
    task("last-sun", { completed_at: new Date(2026, 9, 4, 20, 0).toISOString() }),
    task("open"),
  ];

  it("counts items finished since Monday, newest first", () => {
    expect(doneThisWeek(items, WED).map((t) => t.id)).toEqual(["tue", "mon"]);
  });

  it("says how and when each was done", () => {
    expect(doneLabel(items[0])).toBe("Called · Mon");
    expect(doneLabel(items[1])).toBe("Done · Tue");
    expect(doneLabel(items[2])).toBe("Done · Sun"); // completed before 00172: no method recorded
  });
});

describe("due labels", () => {
  it("names nearby days and dates further out", () => {
    expect(dueLabel(TODAY, TODAY)).toBe("Today");
    expect(dueLabel("2026-10-08", TODAY)).toBe("Tomorrow");
    expect(dueLabel("2026-10-10", TODAY)).toBe("Saturday");
    expect(dueLabel("2026-10-20", TODAY)).toBe("Oct 20");
  });

  it("says when an overdue item was due", () => {
    expect(overdueLabel("2026-10-06", TODAY)).toBe("Was due yesterday");
    expect(overdueLabel("2026-10-01", TODAY)).toBe("Was due Oct 1");
  });
});

describe("what gets written to the client's profile", () => {
  it("uses the note, or a plain line when there isn't one", () => {
    expect(contactDescription("text", "  Confirmed Saturday showing ")).toBe("Confirmed Saturday showing");
    expect(contactDescription("call", "")).toBe("Call (from Checklist)");
  });

  it("records a missed attempt as a note line", () => {
    expect(attemptDescription("call", "")).toBe("Tried to call them, couldn't reach them");
    expect(attemptDescription("meeting", "Left a voicemail")).toBe("Tried to meet with them, couldn't reach them. Left a voicemail");
  });

  it("titles one-tap items Contact <name>", () => {
    expect(contactItemTitle(" Sam Porter ")).toBe("Contact Sam Porter");
  });

  it("never uses em dashes in copy", () => {
    for (const s of [contactDescription("call", ""), attemptDescription("text", "x"), overdueLabel("2026-10-01", TODAY)]) {
      expect(s).not.toContain("—");
    }
  });
});
