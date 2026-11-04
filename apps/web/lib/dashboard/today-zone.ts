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
 * Empty beside a KPI card that shows them (pipelineDepthStatus holds the rule,
 * for the opportunity read too).
 */
export function dailyBriefingPipelineChip(
  deals: readonly { stage: string; condition_status?: string | null }[],
  listingCount: number,
): PipelineChip {
  const count = excludeCollapsedDeals(activePipelineDeals(deals)).length;
  const depth = pipelineDepthStatus(count, listingCount);
  if (depth === "empty") return { label: "Empty", depth };
  if (count === 0) return { label: `Light (${listingCount} listing${listingCount === 1 ? "" : "s"})`, depth };
  const dealCount = `${count} deal${count === 1 ? "" : "s"}`;
  return { label: depth === "light" ? `Light (${dealCount})` : dealCount, depth };
}

/**
 * The pipeline's size in words: the Pipeline Weighted card's caption and the
 * Morning Brief's row, so the two can't count it differently. Null when there
 * are no deals and no listings, the page's one meaning of an empty pipeline.
 */
export function pipelineCountLabel(dealCount: number, listingCount: number): string | null {
  if (dealCount === 0 && listingCount === 0) return null;
  const deals = `${dealCount} deal${dealCount === 1 ? "" : "s"}`;
  const listings = `${listingCount} listing${listingCount === 1 ? "" : "s"}`;
  if (dealCount === 0) return listings;
  return listingCount > 0 ? `${deals} + ${listings}` : deals;
}

/** Clients in Boarding or In-Flight with no contact logged in the last 14 days. */
export function outreachLabel(count: number): string {
  return count === 1 ? "1 client needs outreach" : `${count} clients need outreach`;
}

export interface BriefingItemLink {
  href: string;
  label: string;
}

/**
 * Where a Daily Briefing item opens. A listing appointment with no client on it
 * carries an empty clientId, and /crm?client= would open nothing, so it goes to
 * the CRM itself.
 */
export function briefingItemLink(clientId: string | null | undefined): BriefingItemLink {
  return clientId
    ? { href: `/crm?client=${encodeURIComponent(clientId)}`, label: "Open client" }
    : { href: "/crm", label: "Open CRM" };
}

export interface TaskDueCounts {
  overdue: number;
  dueToday: number;
}

/** Open checklist items past due and due today. Pass the day the Checklist card uses. */
export function taskDueCounts(tasks: readonly { due_date: string }[], todayISO: string): TaskDueCounts {
  return {
    overdue: tasks.filter((t) => t.due_date < todayISO).length,
    dueToday: tasks.filter((t) => t.due_date === todayISO).length,
  };
}

export interface QuietBriefingInput extends TaskDueCounts {
  /** A read the briefing rests on failed, so an empty briefing proves nothing. */
  readFailed: boolean;
}

export interface QuietBriefingLine {
  text: string;
  tone: "clear" | "caution";
}

/**
 * The line shown when the Daily Briefing has no items. It says no urgent client
 * actions only when that is known: computeIntelligenceBriefing never reads
 * contact_tasks, so an empty briefing can sit above overdue checklist items, and
 * a failed read also leaves it empty. Not "all clear" either way: the agent may
 * be behind on the year.
 */
export function quietBriefingLine({ readFailed, overdue, dueToday }: QuietBriefingInput): QuietBriefingLine {
  if (readFailed) return { text: "Daily Briefing didn't load. Reload the page to try again.", tone: "caution" };
  const onChecklist = [
    overdue > 0 ? `${overdue} overdue` : null,
    dueToday > 0 ? `${dueToday} due today` : null,
  ].filter(Boolean);
  if (onChecklist.length > 0) {
    return { text: `Daily Briefing: nothing new today. On your Checklist: ${onChecklist.join(", ")}.`, tone: "caution" };
  }
  return { text: "Daily Briefing: no urgent client actions today.", tone: "clear" };
}

export interface PaceStatementInput {
  goalGCI: number;
  ytdGCI: number;
  ytdDealCount: number;
  /** paceVsGoalPercent's figure. */
  pacePercent: number;
}

export type PaceState = "behind" | "on-pace" | "ahead" | "goal-reached";

export interface PaceStatement {
  state: PaceState;
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
      state: "goal-reached",
      title: "Annual goal reached",
      body: ytdGCI > goalGCI
        ? `You've closed ${fmtCurrency(ytdGCI)} in GCI, ${fmtCurrency(ytdGCI - goalGCI)} over your goal.`
        : `You've closed ${fmtCurrency(ytdGCI)} in GCI, which meets your goal.`,
    };
  }
  const gap = goalGCI - ytdGCI;
  const dealsNeeded = ytdDealCount > 0 && ytdGCI > 0 ? Math.ceil(gap / (ytdGCI / ytdDealCount)) : null;
  const toGo = dealsNeeded !== null
    ? `${fmtCurrency(gap)} to go, about ${dealsNeeded} more deal${dealsNeeded === 1 ? "" : "s"} at your average deal size.`
    : `${fmtCurrency(gap)} to go.`;
  const shownPercent = (100 + pacePercent).toFixed(0);
  const body = `Your GCI is ${shownPercent}% of what you'd need by today to be on pace for your goal. ${toGo}`;
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
  /** Draw quietBriefingLine() above the cards. */
  showBriefingLine: boolean;
}

/**
 * What the Today zone draws. An empty card is left out rather than drawn as a
 * blank box, and an empty briefing leaves one line. Customize draws both cards
 * so either can be hidden or shown.
 */
export function todayZoneLayout(input: TodayZoneInput): TodayZoneLayout {
  if (input.customizeMode) return { cards: ["client_briefing", "tasks"], showBriefingLine: false };
  const cards: TodayCardId[] = [];
  if (!input.briefingHidden && input.briefingHasContent) cards.push("client_briefing");
  if (!input.tasksHidden && input.tasksHasContent) cards.push("tasks");
  return { cards, showBriefingLine: !input.briefingHidden && !input.briefingHasContent };
}
