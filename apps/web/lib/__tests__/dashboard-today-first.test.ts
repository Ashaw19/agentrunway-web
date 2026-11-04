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
    expect(code).toContain('truncate" title={task.title}');
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

  it("takes its one statement from the helper, fed by the engine's figure", () => {
    expect(code).toMatch(/paceStatement\(\{[^}]*pacePercent[^}]*\}\)/);
    expect(code).toContain("paceVsGoalPercent(goalGCI, ytdGCI, fraction)");
  });
});

describe("confetti", () => {
  it("is decided by the pure helper and never by a per-mount ref", () => {
    expect(code).not.toContain("confettiFiredRef");
    expect(code).toContain("decideGoalMilestone(");
    const effect = code.slice(code.indexOf("decideGoalMilestone("));
    expect(code.indexOf("fireConfetti(")).toBe(code.indexOf("decideGoalMilestone(") + effect.indexOf("fireConfetti("));
    for (const level of [100, 75, 50]) expect(effect).toContain(`celebrate === ${level}`);
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
    expect(code).toContain("captainReadSentence(narrative.weakestLabel, narrative.pipelineEmpty, narrative.paceState)");
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
    expect(line).toMatch(/listings and no deals/);
  });
});
