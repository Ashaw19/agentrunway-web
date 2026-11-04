import { describe, expect, it } from "vitest";
import {
  checkGoalMilestone,
  decideGoalMilestone,
  goalMilestoneKey,
  goalMilestoneLevel,
  readGoalMilestone,
  writeGoalMilestone,
} from "../goal-milestones";

const GOAL = 200_000;

describe("goalMilestoneLevel", () => {
  it("reads the highest of 50, 75 and 100 percent reached", () => {
    expect(goalMilestoneLevel(0, GOAL)).toBe(0);
    expect(goalMilestoneLevel(99_999, GOAL)).toBe(0);
    expect(goalMilestoneLevel(100_000, GOAL)).toBe(50);
    expect(goalMilestoneLevel(150_000, GOAL)).toBe(75);
    expect(goalMilestoneLevel(200_000, GOAL)).toBe(100);
    expect(goalMilestoneLevel(500_000, GOAL)).toBe(100);
  });

  it("is 0 without a goal", () => {
    expect(goalMilestoneLevel(100_000, 0)).toBe(0);
    expect(goalMilestoneLevel(100_000, -5)).toBe(0);
  });
});

describe("decideGoalMilestone", () => {
  it("records silently when no record exists yet, so old news is not celebrated", () => {
    expect(decideGoalMilestone(null, 120_000, GOAL)).toEqual({ celebrate: null, store: 50 });
    expect(decideGoalMilestone(null, 210_000, GOAL)).toEqual({ celebrate: null, store: 100 });
  });

  it("records 0 when no milestone is reached yet, so the first crossing still celebrates", () => {
    expect(decideGoalMilestone(null, 10_000, GOAL)).toEqual({ celebrate: null, store: 0 });
    expect(decideGoalMilestone(0, 110_000, GOAL)).toEqual({ celebrate: 50, store: 50 });
  });

  it("does nothing on reload when the level is unchanged", () => {
    expect(decideGoalMilestone(50, 120_000, GOAL)).toEqual({ celebrate: null, store: null });
    expect(decideGoalMilestone(100, 300_000, GOAL)).toEqual({ celebrate: null, store: null });
  });

  it("celebrates a closing recorded in the session that crosses a milestone", () => {
    expect(decideGoalMilestone(50, 151_000, GOAL)).toEqual({ celebrate: 75, store: 75 });
    expect(decideGoalMilestone(75, 200_000, GOAL)).toEqual({ celebrate: 100, store: 100 });
  });

  it("celebrates only the highest when one closing crosses two milestones", () => {
    expect(decideGoalMilestone(0, 205_000, GOAL)).toEqual({ celebrate: 100, store: 100 });
  });

  it("never celebrates a milestone twice in a year, even after falling back below it", () => {
    expect(decideGoalMilestone(75, 110_000, GOAL)).toEqual({ celebrate: null, store: null });
    expect(decideGoalMilestone(75, 150_000, GOAL)).toEqual({ celebrate: null, store: null });
  });

  it("neither celebrates nor records without a goal", () => {
    expect(decideGoalMilestone(null, 500_000, 0)).toEqual({ celebrate: null, store: null });
    expect(decideGoalMilestone(50, 500_000, 0)).toEqual({ celebrate: null, store: null });
  });
});

function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const THROWING = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("the stored milestone", () => {
  const key = goalMilestoneKey("user-1", 2026);

  it("is kept per user and per year", () => {
    expect(goalMilestoneKey("user-2", 2026)).not.toBe(key);
    expect(goalMilestoneKey("user-1", 2027)).not.toBe(key);
  });

  it("round-trips", () => {
    const storage = fakeStorage();
    expect(readGoalMilestone(storage, key)).toBeNull();
    writeGoalMilestone(storage, key, 75);
    expect(readGoalMilestone(storage, key)).toBe(75);
  });

  it("reads anything that is not a milestone as no record", () => {
    for (const bad of ["", "abc", "60", "NaN", "-1"]) {
      expect(readGoalMilestone(fakeStorage({ [key]: bad }), key), bad).toBeNull();
    }
    expect(readGoalMilestone(fakeStorage({ [key]: "0" }), key)).toBe(0);
  });

  it("survives blocked or missing storage", () => {
    expect(readGoalMilestone(THROWING, key)).toBeNull();
    expect(() => writeGoalMilestone(THROWING, key, 50)).not.toThrow();
    expect(readGoalMilestone(null, key)).toBeNull();
    expect(() => writeGoalMilestone(null, key, 50)).not.toThrow();
  });
});

describe("checkGoalMilestone", () => {
  const run = (storage: ReturnType<typeof fakeStorage> | null, session: Map<string, 0 | 50 | 75 | 100>, figuresYear: number, ytdGCI: number) =>
    checkGoalMilestone({ storage, session, userId: "user-1", figuresYear, ytdGCI, goalGCI: GOAL });

  it("records silently the first time, then celebrates a crossing once", () => {
    const storage = fakeStorage();
    const session = new Map();
    expect(run(storage, session, 2026, 90_000)).toBeNull();
    expect(storage.getItem(goalMilestoneKey("user-1", 2026))).toBe("0");
    expect(run(storage, session, 2026, 110_000)).toBe(50);
    expect(run(storage, session, 2026, 110_000)).toBeNull();
    expect(run(storage, new Map(), 2026, 110_000)).toBeNull();
  });

  it("files figures under the year they were loaded for, so New Year's Eve's level can't use up the next year's", () => {
    // A tab open at 75% on Dec 31 re-renders after midnight: the figures are
    // still 2026's, so figuresYear is too and 2027 stays untouched.
    const storage = fakeStorage({ [goalMilestoneKey("user-1", 2026)]: "75" });
    const session = new Map();
    expect(run(storage, session, 2026, 160_000)).toBeNull();
    expect(storage.getItem(goalMilestoneKey("user-1", 2027))).toBeNull();
    // The first load of 2027 starts where 2027 stands, and its crossings count.
    expect(run(storage, session, 2027, 5_000)).toBeNull();
    expect(run(storage, session, 2027, 110_000)).toBe(50);
    expect(run(storage, session, 2027, 155_000)).toBe(75);
  });

  it("doesn't carry one year's session record into another when storage is blocked", () => {
    const session = new Map();
    expect(run(null, session, 2026, 90_000)).toBeNull();
    expect(run(null, session, 2026, 160_000)).toBe(75);
    expect(run(null, session, 2026, 160_000)).toBeNull();
    expect(run(null, session, 2027, 5_000)).toBeNull();
    expect(run(null, session, 2027, 110_000)).toBe(50);
  });
});
