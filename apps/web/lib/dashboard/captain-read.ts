/**
 * The Captain's read in the score hero: one line and the question it seeds into
 * the Flight Crew chat. Pure, no React. Both come from the weakest score
 * component the narrative already found.
 *
 * Copy obeys feedback_avoid_ai_tells_in_content: no em dashes, no rule-of-three
 * triads, no marketing adjectives.
 */
import type { PaceState } from "./today-zone";

const NO_GOAL_LEVER = "It only moves once you set an annual goal in Settings.";

/**
 * The Reports page's line under "Biggest opportunity: Goal Pace". Takes the
 * page's own paceStatus. That page draws no pace statement to agree with, but it
 * can't call an agent behind who is ahead or has no goal.
 */
export function goalPaceOpportunityLine(paceStatus: "ahead" | "behind" | "no-goal"): string {
  if (paceStatus === "no-goal") return NO_GOAL_LEVER;
  if (paceStatus === "behind") return "You're behind on your annual GCI target. Closing one more deal could shift this significantly.";
  return "This is your lowest bar, and you're at or ahead of expected pace. Another closing still lifts it.";
}

/**
 * Weakest component framed as the current drag plus the fastest lever.
 *
 * State-aware: the read must never point at an action the data shows is
 * impossible. When the pipeline is empty (no deals AND no active listings),
 * "closing one pipeline deal" or "adding a deal or two" reads as advice for a
 * deal that does not exist, so the read points at the real first move: adding a
 * prospect. `pipelineEmpty` is the same signal the hero's "Add your first
 * prospect" empty state uses.
 *
 * Goal Pace can be the lowest bar for an agent who isn't behind: the bar maps
 * -50%..+50% to 0..100, so slightly ahead scores about 53. It's a drag only when
 * the page's pace statement (paceStatement) says behind; otherwise the line names
 * the bar and makes no claim about pace, so it can't contradict that statement.
 *
 * `paceState` is null when no goal is set. The bar then sits still whatever is
 * closed (buildHealthReport skips it without a goal), so setting a goal
 * is the only lever and a closing or a prospect would be a false one.
 */
export function captainReadSentence(
  label: string | null,
  pipelineEmpty: boolean,
  paceState: PaceState | null,
): string {
  switch (label) {
    case "Goal Pace":
      if (paceState === null) return `Goal Pace is your lowest score bar right now. ${NO_GOAL_LEVER}`;
      if (paceState !== "behind") {
        if (pipelineEmpty) return "Goal Pace is your lowest score bar right now. Your pipeline is empty, so adding a prospect is the next move.";
        return paceState === "goal-reached"
          ? "Goal Pace is your lowest score bar right now. Each deal you close past your goal still lifts it."
          : "Goal Pace is your lowest score bar right now. Closing one pipeline deal lifts it.";
      }
      return pipelineEmpty
        ? "Goal pace is your biggest drag right now. Your pipeline is empty, so adding a prospect is the first move."
        : "Goal pace is your biggest drag right now. Closing one pipeline deal moves your score the most.";
    case "Pipeline":
      return pipelineEmpty
        ? "Pipeline is your biggest drag right now. Adding your first prospect is the fastest way to move your score."
        : "Pipeline is your biggest drag right now. Adding a deal or two is the fastest way to move your score.";
    case "Expenses":
      return "Your expense ratio is the biggest drag on your score right now. Trimming overhead is the fastest lever.";
    case "Benchmark":
      return "Your benchmark ranking is the biggest drag right now. Lifting projected GCI is what moves it.";
    case "Survival":
      return "Cash runway is the biggest drag on your score right now. Extending coverage is the fastest lever.";
    default:
      return "Your score is holding steady. Ask the Captain where the next gain is.";
  }
}

export interface CaptainReadQuestionInput {
  weakestLabel: string | null;
  weakestScore: number | null;
  pipelineEmpty: boolean;
  paceState: PaceState | null;
}

const NOT_BEHIND_NOTE: Partial<Record<PaceState, string>> = {
  "on-pace": " I'm on pace for my annual goal.",
  ahead: " I'm ahead of pace on my annual goal.",
  "goal-reached": " I've already reached my annual goal.",
};

/**
 * The question seeded into the Flight Crew chat. References the specific weakest
 * component so the Captain opens on a relevant, narrow answer. It states what
 * the page shows (an empty pipeline, a pace that isn't behind) so the Captain's
 * opening answer can't assume otherwise.
 */
export function captainReadQuestion({ weakestLabel, weakestScore, pipelineEmpty, paceState }: CaptainReadQuestionInput): string {
  if (weakestLabel && weakestScore !== null) {
    const pipelineNote = pipelineEmpty ? " My pipeline is empty right now." : "";
    const ask = "What is the single fastest lever I can pull this month to move my score, and what would the impact be?";
    if (weakestLabel === "Goal Pace") {
      if (paceState === null) {
        return `Goal Pace is my lowest Runway Score bar at ${weakestScore} out of 100. I have no annual goal set for this year, and the bar can't move until I set one. What goal would fit my numbers, and how do I set it?`;
      }
      if (paceState !== "behind") {
        return `Goal Pace is my lowest Runway Score bar at ${weakestScore} out of 100.${NOT_BEHIND_NOTE[paceState] ?? ""}${pipelineNote} ${ask}`;
      }
    }
    return `My Runway Score's biggest drag is ${weakestLabel} at ${weakestScore} out of 100.${pipelineNote} ${ask}`;
  }
  return "What is the single fastest lever I can pull this month to move my Runway Score?";
}
