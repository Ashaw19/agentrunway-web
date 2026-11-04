/**
 * Guard for the dashboard's layout rules (2026-11-04): Today leads the page,
 * pace is stated once, confetti fires only on a real crossing, the Pipeline
 * chip counts deals, and the Quick tip stays in the page flow.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/app/(app)/settings/actions", () => ({ dismissAiProfilePrompt: vi.fn() }));

import { AiProfilePrompt } from "@/app/(app)/dashboard/ai-profile-prompt";
import { buildHealthReport, GOAL_PACE_SCORE_SPAN_PCT } from "@agent-runway/core/engines/health-report";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.resolve(WEB, "../..");
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");
const dash = read("app/(app)/dashboard/dashboard-content.tsx");
const code = dash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the page's order", () => {
  const at = (marker: string) => {
    const i = code.indexOf(marker);
    expect(i, marker).toBeGreaterThan(-1);
    return i;
  };

  it("runs greeting, Today, seasonal prompt, Quick tip, score hero, sortable cards", () => {
    const steps = [
      "greet-fade",
      'aria-label="Today"',
      "<NextYearGoalPrompt",
      "<AiProfilePrompt",
      'data-tour="dashboard-score"',
      "<SortableContext",
    ].map(at);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("splits Today into two columns only where the Checklist has room", () => {
    // At lg (1024) the sidebar still shows and the Checklist gets 277px: titles cut to fragments.
    for (const source of [code, read("app/(app)/dashboard/loading.tsx")]) {
      expect(source).toContain("xl:grid-cols-[3fr_2fr]");
      expect(source).not.toContain("lg:grid-cols-[3fr_2fr]");
    }
    // Even there the 2fr column is 379px at 1280, so a title wraps rather than cuts.
    expect(code).toContain('line-clamp-2 break-words" title={task.title}');
    expect(code).not.toContain('truncate" title={task.title}');
  });

  it("does not keep a Today card in the sortable list", () => {
    expect(code).toContain("resolveDashboardLayout(dashboardLayout)");
    expect(code).toMatch(/cardRenders\[id\]/);
  });
});

describe("pace is said once", () => {
  it("has none of the removed framings", () => {
    for (const gone of [
      "to goal pace",
      "ahead of pace`",
      "last year's pace",
      "Pace: {",
      "to hit goal",
      "deal${Math.ceil",
      "getMotivationalTag",
    ]) {
      expect(code, gone).not.toContain(gone);
    }
  });

  it("the Weekly Business Brief states no pace of its own, in dollars or as time elapsed", () => {
    for (const gone of ["pace required", "expected at this point", "% elapsed", "pctElapsed", "paceGapAmount", "on track"]) {
      expect(code, gone).not.toContain(gone);
    }
  });

  it("the Morning Brief doesn't print the seasonal fraction as the calendar", () => {
    // 59% earned, 87% through the year is the amber box's 68% in other words, and
    // on November 4 the calendar says 84%.
    for (const gone of ["pctOfYear", "% through the year"]) expect(code, gone).not.toContain(gone);
    expect(code).toContain("{pctOfGoal}% earned.");
  });

  it("calls Goal Pace a drag in the brief only through the helper that checks the state", () => {
    expect(code).not.toContain("primary drag");
    expect(code).toContain("goalPaceWhy({");
  });

  it("takes its one statement from the helper, fed by the engine's figure", () => {
    expect(code).toMatch(/paceStatement\(\{[^}]*pacePercent[^}]*\}\)/);
    expect(code).toContain("paceVsGoalPercent(goalGCI, ytdGCI, fraction)");
  });
});

describe("what the Goal Pace bar means", () => {
  it("the score dialog states the engine's mapping, with no full credit at expected pace", () => {
    expect(code).not.toContain("Full credit");
    expect(code).toContain("It reads 50 at exactly expected pace, 100 at ${GOAL_PACE_SCORE_SPAN_PCT}% ahead and 0 at ${GOAL_PACE_SCORE_SPAN_PCT}% behind");
    const pace = (ytdGCI: number) => buildHealthReport(ytdGCI, 100_000, 1, 0, 0).paceScore;
    expect(pace(100_000)).toBe(50);
    expect(pace(100_000 * (1 + GOAL_PACE_SCORE_SPAN_PCT / 100))).toBe(100);
    expect(pace(100_000 * (1 - GOAL_PACE_SCORE_SPAN_PCT / 100))).toBe(0);
  });
});

describe("one figure, one wording", () => {
  it("the Morning Brief and the KPI card word the pipeline from one helper, on one weighted figure", () => {
    const brief = code.slice(code.indexOf('cardRenders["morning_brief"]'), code.indexOf("const todayAlerts"));
    expect(brief).toContain("pipelineCountLabel(pipelineCount, listingCount)");
    expect(brief).toContain("pipelineWeightedGCI + listingWeightedGCI");
    expect(brief).not.toMatch(/\{pipelineCount > 0 \? \(/);
    expect(code).toContain("${pipelineCountLabel(pipelineCount, listingCount)} · probability-weighted");
  });

  it("the Weekly Business Brief calls a pipeline empty only with no deals and no listings", () => {
    expect(code).toContain("pipelineEmpty,");
    expect(code).not.toContain("Your pipeline is empty, so adding prospects");
    expect(code).toMatch(/Pipeline:\s+pipelineEmpty\s+\? `Pipeline is empty/);
  });

  it("the Morning Brief's runway is the hero's, including the 24+ cap", () => {
    expect(code).toContain("{formatSurvivalDisplay(survival)} of operating runway");
    expect(code).not.toContain("months.toFixed(1)");
  });

  it("the Projected Year-End chip says what it measures", () => {
    expect(code).toContain("Last 2 months&apos; GCI: {trend}");
    expect(code).not.toMatch(/^\s*\{trend\}\s*$/m);
  });

  it("the outreach count has one wording and shows once", () => {
    expect(code).not.toMatch(/need outreach/);
    expect(code.match(/outreachLabel\(staleLeadCount\)/g)).toHaveLength(3);
    expect(code).toContain('staleLeadCount > 0 && hiddenCards.has("client_briefing")');
  });
});

describe("the Daily Briefing can be acted on", () => {
  const briefing = code.slice(code.indexOf('cardRenders["client_briefing"]'), code.indexOf('cardRenders["where_you_stand"]'));

  it("Start here and the items below it open the client", () => {
    expect(briefing).toContain("href={briefingItemLink(startHereItem.clientId).href}");
    expect(briefing).toContain("href={briefingItemLink(item.clientId).href}");
  });

  it("the link to the CRM is drawn whatever else the card holds", () => {
    // The Needs attention block is conditional: the link has to sit after it closes.
    const block = briefing.indexOf("{((startHereItem ? briefingItems.slice(1)");
    expect(block).toBeGreaterThan(-1);
    const blockEnd = briefing.indexOf("\n        )}\n", block);
    expect(blockEnd).toBeGreaterThan(block);
    expect(briefing.indexOf("View full briefing in CRM")).toBeGreaterThan(blockEnd);
  });

  it("keeps a condition's deadline on a narrow screen", () => {
    const row = briefing.slice(briefing.indexOf("upcomingConditions.map"), briefing.indexOf("Needs attention"));
    expect(row).toContain('"shrink-0 font-semibold"');
    expect(row).toContain('"min-w-0 truncate"');
    expect(row.indexOf('"min-w-0 truncate"')).toBeLessThan(row.indexOf("{c.address}"));
    expect(row.indexOf('"shrink-0 font-semibold"')).toBeGreaterThan(row.indexOf("{c.client_name}"));
  });
});

describe("Checklist counts rest on every open item", () => {
  const unbounded = (source: string, marker: string) => {
    const at = source.indexOf(marker);
    expect(at, marker).toBeGreaterThan(-1);
    const query = source.slice(source.lastIndexOf("fetchAllRows", at), source.indexOf(".range(from, to)", at));
    expect(query).toContain('.is("completed_at", null)');
    expect(query).toContain('.order("id")');
    expect(query).not.toContain(".limit(");
  };

  it("on the dashboard, the Captain's context and the Captain's agenda", () => {
    unbounded(read("app/(app)/dashboard/page.tsx"), '.select("*, clients(name)")');
    unbounded(read("app/api/chat/route.ts"), '.from("contact_tasks").select("id, title, due_date, priority, client_id")');
    unbounded(read("lib/ai/tools.ts"), '.from("contact_tasks").select("title, due_date, priority, client_id")');
  });

  it("the card's +N more counts what it didn't show", () => {
    expect(code).toContain("+{localTasks.length - shown.length} more.");
  });
});

describe("a year deliberately set to $0", () => {
  it("is told apart from an unset year everywhere the page would nudge", () => {
    expect(code).toContain("goalGCI <= 0 && goalSetToZero(incomeGoals, goalCurrentYear)");
    expect(code).toContain("goalGCI <= 0 && !goalIsZero");
    expect(code).toContain('goalIsZero ? "This year\'s goal is set to $0" : "Set a goal in Settings"');
    expect(code).toContain('weakest.label === "Goal Pace" && goalIsZero');
    expect(code).toContain("narrative.paceState, narrative.goalIsZero)");
    const reportsPage = read("app/(app)/reports/page.tsx");
    expect(reportsPage).toContain('.from("income_goals")');
    expect(reportsPage).toContain("goalIsZero={goalSetToZero(");
  });
});

describe("confetti", () => {
  it("is decided by the pure helper and never by a per-mount ref", () => {
    expect(code).not.toContain("confettiFiredRef");
    expect(code).toContain("checkGoalMilestone(");
    const effect = code.slice(code.indexOf("checkGoalMilestone("));
    expect(code.indexOf("fireConfetti(")).toBe(code.indexOf("checkGoalMilestone(") + effect.indexOf("fireConfetti("));
    for (const level of [100, 75, 50]) expect(effect).toContain(`celebrate === ${level}`);
  });

  it("takes the record's year from the same render as the figures, never the clock", () => {
    const check = code.slice(code.indexOf("checkGoalMilestone("), code.indexOf("fireConfetti("));
    expect(check).toContain("figuresYear,");
    expect(code).not.toMatch(/goalMilestoneKey\(|ytdGCI, goalGCI, milestoneUserId, goalCurrentYear/);
    expect(read("app/(app)/dashboard/page.tsx")).toContain("figuresYear={dashYear}");
  });
});

describe("the Pipeline chip and the empty line", () => {
  it("counts the same deals the KPI card counts", () => {
    expect(code).toContain("dailyBriefingPipelineChip(livePipelineDeals, listingCount)");
    expect(code).not.toMatch(/activeClients\b/);
  });

  it("never reads as all clear", () => {
    expect(code).not.toContain("All clear");
    expect(read("lib/ai/tools.ts")).not.toContain("All clear");
  });

  it("words the empty briefing from what the page knows: the Checklist and whether the reads worked", () => {
    expect(code).toContain("readFailed: briefingReadFailed");
    expect(code).toContain("taskDueCounts(localTasks, checklistDayISO)");
    expect(code).toContain("{quietLine.text}");
    const page = read("app/(app)/dashboard/page.tsx");
    const reads = page.slice(page.indexOf("const briefingReadFailed = ["), page.indexOf(".some((result) => result.error != null)"));
    for (const result of [
      "tasksResult",
      "activeClientsResult",
      "recentActivitiesResult",
      "briefingClientsResult",
      "briefingActivitiesResult",
      "briefingRecordsResult",
      "listingResult",
    ]) {
      expect(reads, result).toContain(result);
    }
    expect(page).toContain("briefingReadFailed={briefingReadFailed}");
  });

  it("the phone briefing doesn't say no urgent client actions above overdue tasks, in en and fr-CA", () => {
    const screen = readFileSync(path.join(REPO, "apps/mobile/app/(app)/profile/briefing.tsx"), "utf8");
    expect(screen).toContain('overdueTaskCount > 0 ? t("briefing.nothingNew") : t("briefing.allClear")');
    expect(screen).toContain('t("briefing.checklistOverdue", { count: overdueTaskCount })');
    const en = JSON.parse(readFileSync(path.join(REPO, "packages/i18n/mobile/en/profile.json"), "utf8"));
    const fr = JSON.parse(readFileSync(path.join(REPO, "packages/i18n/mobile/fr-CA/profile.json"), "utf8"));
    for (const strings of [en, fr]) {
      expect(strings.briefing.nothingNew).toBeTruthy();
      expect(strings.briefing.checklistOverdue_one).toContain("{{count}}");
      expect(strings.briefing.checklistOverdue_other).toContain("{{count}}");
    }
  });

  it("the Captain's agenda tool doesn't read a failed read as nothing to do", () => {
    const tools = read("lib/ai/tools.ts");
    const tool = tools.slice(tools.indexOf("getUpcomingAgenda: tool("), tools.indexOf("getAIActivity: tool("));
    expect(tool.indexOf("tasksRes.error || outreachRes.error || staleRes.error")).toBeGreaterThan(-1);
    expect(tool.indexOf("tasksRes.error || outreachRes.error || staleRes.error")).toBeLessThan(tool.indexOf('return "No overdue tasks'));
  });

  it("the phone briefing says what is empty, in en and fr-CA", () => {
    const en = JSON.parse(readFileSync(path.join(REPO, "packages/i18n/mobile/en/profile.json"), "utf8"));
    const fr = JSON.parse(readFileSync(path.join(REPO, "packages/i18n/mobile/fr-CA/profile.json"), "utf8"));
    expect(en.briefing.allClear).toMatch(/no urgent client actions/i);
    expect(fr.briefing.allClear).toMatch(/aucune action client urgente/i);
  });

  it("the opportunity read counts pipeline deals for its pipeline state", () => {
    const route = read("app/api/ai/detect-opportunities/route.ts");
    expect(route).not.toMatch(/\bactiveClients\b/);
    expect(route).toMatch(/\.from\("pipeline_deals"\)/);
    expect(route).toContain("activePipelineDeals(");
    expect(route).toContain("pipelineDepthStatus(");
  });
});

describe("the Quick tip", () => {
  const tip = read("app/(app)/dashboard/ai-profile-prompt.tsx");
  const tipCode = tip.replace(/\/\*[\s\S]*?\*\//g, "");

  it("is in the page flow, never floating over content", () => {
    expect(tipCode).not.toMatch(/\bfixed\b|\babsolute\b|\bsticky\b|shadow-xl/);
  });

  it("keeps the link and the dismiss", () => {
    expect(tip).toContain('href="/settings#ai-voice"');
    expect(tip).toContain("dismissAiProfilePrompt");
  });

  describe("stays dismissed", () => {
    const render = (lastDismissedAt: string | null) => renderToStaticMarkup(createElement(AiProfilePrompt, {
      hasVoiceProfile: false,
      hasBusinessIdentity: false,
      lastDismissedAt,
      onDismissed: () => {},
    }));
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

    it("for 7 days, reading only what it is handed, so a remount can't bring it back", () => {
      expect(render(null)).toContain("Quick tip");
      expect(render(daysAgo(1))).toBe("");
      expect(render(daysAgo(8))).toContain("Quick tip");
      expect(tipCode).not.toContain("useState");
    });

    it("with the dismissal held above the year switch, which unmounts the tip", () => {
      expect(code.indexOf("useState<string | null>(null)")).toBeLessThan(code.indexOf('viewYear === "next"'));
      expect(code).toContain("lastDismissedAt={tipDismissedAt ?? aiProfilePromptDismissedAt}");
      expect(code).toContain("onDismissed={setTipDismissedAt}");
    });
  });

  it("is gone in the next-year view", () => {
    const nextYearBranch = code.slice(code.indexOf('viewYear === "next"'), code.indexOf("<NextYearGoalPrompt"));
    expect(nextYearBranch).not.toContain("<AiProfilePrompt");
    expect(code.indexOf("<AiProfilePrompt")).toBeLessThan(code.lastIndexOf("</>"));
  });
});

describe("the Captain's read in the hero", () => {
  it("takes its state from the page's one pace statement", () => {
    expect(code.indexOf("const paceAlert = paceStatement(")).toBeLessThan(code.indexOf("const scoreNarrative = buildScoreNarrative("));
    expect(code).toContain("paceAlert?.state ?? null");
    expect(code).toContain("captainReadSentence(narrative.weakestLabel, narrative.pipelineEmpty, narrative.paceState, narrative.goalIsZero)");
  });

  it("the Morning Brief and Reports don't offer a closing as the lever with no goal set", () => {
    expect(read("lib/dashboard/captain-read.ts")).toContain("No annual goal is set, so Goal Pace");
    expect(code).toContain('weakest.label === "Goal Pace" && goalGCI <= 0');
    const reports = read("app/(app)/reports/reports-content.tsx");
    expect(reports).toContain("goalPaceOpportunityLine(paceStatus, goalIsZero)");
    expect(reports).not.toContain("You're behind on your annual GCI target");
  });
});

describe("the Captain knows the layout", () => {
  const kb = read("lib/knowledge-base.ts");

  it("describes Today first, the pinned cards and the one pace statement", () => {
    const line = kb.split("\n").find((l) => l.startsWith("**DASHBOARD**"))!;
    expect(line).toMatch(/Today/);
    expect(line).toMatch(/Start here/);
    expect(line).toMatch(/Customize/);
    expect(line).toMatch(/pace/i);
    expect(line).toMatch(/Quick tip/);
    expect(line).toMatch(/50%, 75% or 100%/);
    expect(line).toMatch(/calls Goal Pace a drag only when the pace alert says behind/);
    expect(line).toMatch(/only moves once a goal is set/);
    expect(line).toMatch(/nothing on the Checklist is overdue or due today/);
    expect(line).toMatch(/listings and no deals/);
    expect(line).toMatch(/opens that client/);
    expect(line).toMatch(/deliberately set to \$0/);
    expect(line).toMatch(/reads 50 at exactly expected pace/);
    expect(line).toMatch(/Last 2 months' GCI/);
  });
});
