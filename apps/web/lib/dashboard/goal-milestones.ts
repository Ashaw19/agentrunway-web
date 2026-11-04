/**
 * Goal milestone celebrations: pure, no React, no DOM.
 *
 * The dashboard celebrates 50%, 75% and 100% of the year's goal once each, the
 * moment the agent crosses them. Until 2026-11-04 it fired on every dashboard
 * open at 50% or more, because the "already fired" marker reset on each mount,
 * so an agent behind pace got confetti just for opening the app.
 *
 * Crossing is judged against the highest milestone already recorded for this
 * user and year. Only that record is kept (localStorage, per browser); nothing
 * here computes a business figure. YTD GCI and the goal are handed in.
 */

export const GOAL_MILESTONES = [50, 75, 100] as const;
export type GoalMilestone = (typeof GOAL_MILESTONES)[number];
/** 0 = below the first milestone. */
export type GoalMilestoneLevel = GoalMilestone | 0;

/** The highest milestone `ytdGCI` has reached. 0 without a goal. */
export function goalMilestoneLevel(ytdGCI: number, goalGCI: number): GoalMilestoneLevel {
  if (goalGCI <= 0) return 0;
  const reached = GOAL_MILESTONES.filter((m) => ytdGCI / goalGCI >= m / 100);
  return reached.length > 0 ? reached[reached.length - 1] : 0;
}

export interface GoalMilestoneDecision {
  /** The milestone to celebrate now, or null. */
  celebrate: GoalMilestone | null;
  /** The level to record now, or null to leave the record alone. */
  store: GoalMilestoneLevel | null;
}

/**
 * `stored` is the recorded level, or null when none exists yet.
 *
 * No record: note where the agent stands and stay quiet, so the first open
 * after this shipped (a new browser, a cleared one, January 1) doesn't
 * celebrate old news. 0 is recorded too, so the first real crossing counts.
 *
 * The record only goes up: a deleted deal or a raised goal doesn't rearm a
 * milestone already celebrated this year. A closing that jumps two milestones
 * celebrates the higher one.
 */
export function decideGoalMilestone(
  stored: GoalMilestoneLevel | null,
  ytdGCI: number,
  goalGCI: number,
): GoalMilestoneDecision {
  if (goalGCI <= 0) return { celebrate: null, store: null };
  const level = goalMilestoneLevel(ytdGCI, goalGCI);
  if (stored === null) return { celebrate: null, store: level };
  if (level > stored) return { celebrate: level as GoalMilestone, store: level };
  return { celebrate: null, store: null };
}

export function goalMilestoneKey(userId: string, year: number): string {
  return `ar:goal-milestone:${userId}:${year}`;
}

type MilestoneStorage = Pick<Storage, "getItem" | "setItem">;

/** The browser's storage, or null where reading it throws (blocked site data). */
export function browserMilestoneStorage(): MilestoneStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGoalMilestone(storage: MilestoneStorage | null, key: string): GoalMilestoneLevel | null {
  try {
    const raw = storage?.getItem(key);
    if (raw == null || raw === "") return null;
    const value = Number(raw);
    return value === 0 || (GOAL_MILESTONES as readonly number[]).includes(value)
      ? (value as GoalMilestoneLevel)
      : null;
  } catch {
    return null;
  }
}

export function writeGoalMilestone(storage: MilestoneStorage | null, key: string, level: GoalMilestoneLevel): void {
  try {
    storage?.setItem(key, String(level));
  } catch {
    /* blocked storage: the session's own memory still stops a repeat */
  }
}

export interface CheckGoalMilestoneInput {
  storage: MilestoneStorage | null;
  /** This mount's own record, by key, for when storage is blocked. */
  session: Map<string, GoalMilestoneLevel>;
  userId: string;
  /**
   * The year `ytdGCI` and `goalGCI` belong to: the year the server loaded them
   * for, never the clock. A tab left open over New Year re-renders with a new
   * clock year and last year's figures, and writing those under the new year's
   * key would use up that year's 50% and 75% celebrations.
   */
  figuresYear: number;
  ytdGCI: number;
  goalGCI: number;
}

/** Read the record, decide, write the record. Returns the milestone to celebrate now, or null. */
export function checkGoalMilestone(input: CheckGoalMilestoneInput): GoalMilestone | null {
  const { storage, session, userId, figuresYear, ytdGCI, goalGCI } = input;
  const key = goalMilestoneKey(userId, figuresYear);
  const known = readGoalMilestone(storage, key) ?? session.get(key) ?? null;
  const { celebrate, store } = decideGoalMilestone(known, ytdGCI, goalGCI);
  if (store !== null) {
    session.set(key, store);
    writeGoalMilestone(storage, key, store);
  }
  return celebrate;
}
