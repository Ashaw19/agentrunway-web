/**
 * The dashboard's Today zone and its statements: pure, no React, no DOM.
 *
 * Every figure here is handed in from the canonical engines by
 * dashboard-content.tsx; this module only words them and decides what to draw.
 */
import {
  activePipelineDeals,
  excludeCollapsedDeals,
  pipelineDepthStatus,
  type PipelineDepth,
} from "@agent-runway/core/types/database";
import { fmtCurrency } from "@/lib/formatters";

/** The line under the greeting. Voice only: pace is stated once, in the Today zone. */
export function greetingTag(paceStatus: string, ytdDealCount: number): string {
  if (ytdDealCount === 0) return "Zero on the board. The market has no idea what's coming. 🚀";
  if (paceStatus === "ahead") return "Your accountant is cautiously optimistic.";
  if (paceStatus === "behind") return "The market hasn't read your numbers.";
  return "Quietly dangerous.";
}

export interface PipelineChip {
  label: string;
  depth: PipelineDepth;
}

/**
 * The Daily Briefing's "Pipeline:" chip. It counts pipeline deals, the set the
 * KPI card counts (activePipelineDeals). Until 2026-11-04 it counted clients in
 * Boarding or In-Flight status, so it could say Empty above five open deals.
 *
 * A deal counts unless it is Collapsed; an undated deal counts. Listings don't
 * add to the deal thresholds, but with no deals they keep the chip from saying
 * Empty beside a KPI card that shows them (the same "empty" the hero uses).
 */
export function dailyBriefingPipelineChip(
  deals: readonly { stage: string; condition_status?: string | null }[],
  listingCount: number,
): PipelineChip {
  const count = excludeCollapsedDeals(activePipelineDeals(deals)).length;
  if (count === 0 && listingCount > 0) {
    return { label: `Light (${listingCount} listing${listingCount === 1 ? "" : "s"})`, depth: "light" };
  }
  const depth = pipelineDepthStatus(count);
  if (depth === "empty") return { label: "Empty", depth };
  const dealCount = `${count} deal${count === 1 ? "" : "s"}`;
  return { label: depth === "light" ? `Light (${dealCount})` : dealCount, depth };
}

/** Shown when the Daily Briefing has nothing to say. Not "all clear": the agent may be behind on the year. */
export function noUrgentClientActionsLine(): string {
  return "Daily Briefing: no urgent client actions today.";
}

export interface PaceStatementInput {
  goalGCI: number;
  ytdGCI: number;
  ytdDealCount: number;
  /** paceVsGoalPercent's figure. */
  pacePercent: number;
}

export interface PaceStatement {
  state: "behind" | "on-pace" | "ahead";
  title: string;
  body: string;
}

/**
 * The page's one plain statement of pace (2026-11-04: the word had appeared
 * eight times, in four framings). The same words the Behind pace box always
 * used, now for every state and at any distance, since no other line on the
 * page says it any more. Null without a goal.
 */
export function paceStatement({ goalGCI, ytdGCI, ytdDealCount, pacePercent }: PaceStatementInput): PaceStatement | null {
  if (goalGCI <= 0) return null;
  if (ytdGCI >= goalGCI) {
    return {
      state: "ahead",
      title: "Annual goal reached",
      body: `You've closed ${fmtCurrency(ytdGCI)}, which is ${fmtCurrency(ytdGCI - goalGCI)} over your goal.`,
    };
  }
  const gap = goalGCI - ytdGCI;
  const dealsNeeded = ytdDealCount > 0 && ytdGCI > 0 ? Math.ceil(gap / (ytdGCI / ytdDealCount)) : null;
  const toGo = dealsNeeded !== null
    ? `${fmtCurrency(gap)} to go, about ${dealsNeeded} more deal${dealsNeeded === 1 ? "" : "s"} at your average size.`
    : `${fmtCurrency(gap)} to go.`;
  const shownPercent = (100 + pacePercent).toFixed(0);
  const body = `You're at ${shownPercent}% of expected pace. ${toGo}`;
  if (shownPercent === "100") return { state: "on-pace", title: "On pace for your annual goal", body };
  return pacePercent > 0
    ? { state: "ahead", title: "Ahead of pace on your annual goal", body }
    : { state: "behind", title: "Behind pace on your annual goal", body };
}

export type TodayCardId = "client_briefing" | "tasks";

export interface TodayZoneInput {
  briefingHasContent: boolean;
  tasksHasContent: boolean;
  briefingHidden: boolean;
  tasksHidden: boolean;
  customizeMode: boolean;
}

export interface TodayZoneLayout {
  /** The cards to draw, in order. Two sit side by side on a wide screen; one takes the width. */
  cards: TodayCardId[];
  /** Draw noUrgentClientActionsLine() above the cards. */
  showNoUrgentLine: boolean;
}

/**
 * What the Today zone draws. An empty card is left out rather than drawn as a
 * blank box, and an empty briefing leaves one line. Customize draws both cards
 * so either can be hidden or shown.
 */
export function todayZoneLayout(input: TodayZoneInput): TodayZoneLayout {
  if (input.customizeMode) return { cards: ["client_briefing", "tasks"], showNoUrgentLine: false };
  const cards: TodayCardId[] = [];
  if (!input.briefingHidden && input.briefingHasContent) cards.push("client_briefing");
  if (!input.tasksHidden && input.tasksHasContent) cards.push("tasks");
  return { cards, showNoUrgentLine: !input.briefingHidden && !input.briefingHasContent };
}
