/**
 * The AI layer knows the phone dashboard's Next up (2026-10-19) and the web
 * Flight Control Dismiss menu that shares its rules.
 *
 * Flight Crew answers "how does X work" from the knowledge base, which is
 * always in the prompt. The NEXT UP entry covers the welcome, the score badge
 * and its sheet, the stack and its time bands, today's handful (Flight
 * Control's 5), Skip, Later and Stop (stored once, honoured everywhere), the
 * day's progress, and that Stop leaves a consent-lapsing notice up. The
 * FLIGHT CONTROL entry gains the Dismiss menu and the picks that stay until
 * handled. Both are information: no advice words and no em dash in the new
 * entry (the pattern of recurring-list-footer-ai.test.ts).
 */
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { buildPersonaPrefix } from "@/lib/flight-crew/system-prompts";
import { HANDFUL_TARGET } from "@agent-runway/core/lib/next-up/rules";
import { SCORE_TREND_DAYS, SCORE_TREND_MAX_DAYS } from "@agent-runway/core/lib/next-up/score-badge";

/** Information, not advice, and no em dashes. */
const ADVICE_OR_EM_DASH = /\b(?:should|recommend\w*|must|need to|set aside|build up|top up)\b|—/i;

const entry = (heading: string) =>
  KNOWLEDGE_BASE.split("\n").find((line) => line.startsWith(`**${heading}**`)) ?? "";

describe("knowledge base: NEXT UP", () => {
  const nextUp = () => entry("NEXT UP");

  it("exists, dated, on the phone dashboard", () => {
    expect(nextUp()).not.toBe("");
    expect(nextUp()).toMatch(/^\*\*NEXT UP\*\* \(phone dashboard; since 2026-10-19\)/);
  });

  it("names Skip, Later and Stop, stored once and honoured on every surface", () => {
    for (const word of ["Skip", "Later", "Stop suggesting"]) expect(nextUp()).toContain(word);
    expect(nextUp()).toMatch(/in an hour, tonight or tomorrow/);
    expect(nextUp()).toMatch(/3 months, 6 months or Move to the Hangar/);
    expect(nextUp()).toMatch(/phone, the web Flight Control Scan, the nightly drafts and Flight Crew/);
  });

  it("says today's handful is Flight Control's 5 and how progress reads", () => {
    expect(nextUp()).toContain(`Today's handful`);
    expect(nextUp()).toContain(`Flight Control's ${HANDFUL_TARGET}`);
    expect(nextUp()).toContain(`"2 of ${HANDFUL_TARGET} done today"`);
  });

  it("covers the welcome, the score badge and sheet, the stack and its time bands", () => {
    expect(nextUp()).toMatch(/Good morning/);
    expect(nextUp()).toMatch(/badge/);
    expect(nextUp()).toMatch(/sheet/);
    expect(nextUp()).toMatch(/Always on top/);
    for (const band of ["Morning", "Midday", "Evening"]) expect(nextUp()).toContain(band);
    expect(nextUp()).toMatch(/Also waiting/);
  });

  it("says Stop leaves a consent-lapsing notice up", () => {
    expect(nextUp()).toMatch(/Stop doesn't hide a consent-lapsing notice/);
  });

  it("names the Flight Crew and Connector tools", () => {
    for (const name of ["getNextUp", "skipSuggestedClient", "snoozeSuggestedClient", "stopSuggestingClient", "get_next_up"]) {
      expect(nextUp()).toContain(name);
    }
  });

  it("is information, not advice, with no em dash", () => {
    expect(nextUp()).not.toMatch(ADVICE_OR_EM_DASH);
  });

  // What shipped (final review, fix 4).
  it("Already talked to them has no Undo; Skip, Later and Stop do", () => {
    expect(nextUp()).not.toMatch(/Each choice has Undo/);
    expect(nextUp()).toMatch(/Skip, Later and Stop have Undo on the toast/);
    expect(nextUp()).toMatch(/Already talked to them has no Undo/);
  });

  it("the Text and CASL sentence holds for new leads too (R31)", () => {
    expect(nextUp()).not.toMatch(/no contact yet \(Call, Text, Later\)/);
    expect(nextUp()).toMatch(/new lead under \d+ hours old with no contact yet \(Call and Later, and Text when the CASL check allows it\)/);
    expect(nextUp()).toMatch(/whether a new lead or on the handful, gets Call, never Text/);
    expect(nextUp()).toMatch(/drafts it on the tap/);
  });

  it("overdue and due-today task cards have Later too", () => {
    expect(nextUp()).toMatch(/overdue Checklist items \(Open checklist, Mark one done, Later\)/);
    expect(nextUp()).toMatch(/tasks due today \(Open checklist, Mark one done, Later\)/);
  });

  it("names the score's parts with the phone's labels", () => {
    expect(nextUp()).toContain("(Pace, Pipeline, Expenses, Bench, Survival)");
    expect(nextUp()).not.toMatch(/Benchmark/);
  });

  it("describes the trend tag's window", () => {
    expect(nextUp()).toContain(`${SCORE_TREND_DAYS} to ${SCORE_TREND_MAX_DAYS} days older`);
  });

  it("describes the card in the stack's place when the stack is empty", () => {
    expect(nextUp()).toMatch(/With an empty stack, a card takes the stack's place/);
    expect(nextUp()).toMatch(/"Nothing urgent right now" while Also waiting rows remain/);
    expect(nextUp()).toMatch(/"You're all caught up" when nothing else waits/);
  });

  it("the Today's handful row brings the handful into the stack (R33), and Messages opens the tab that holds them", () => {
    expect(nextUp()).toMatch(/Today's handful row brings the handful's cards into the stack, whatever the time of day/);
    expect(nextUp()).toMatch(/Messages ready opens the Texts tab when every message waiting is a text, else the Emails tab/);
  });

  it("cancelling the iPhone's Call prompt asks nothing (R34)", () => {
    expect(nextUp()).toMatch(/Cancelling the iPhone's Call prompt asks nothing/);
  });
});

describe("knowledge base: FLIGHT CONTROL's Dismiss menu", () => {
  const fc = () => entry("FLIGHT CONTROL");

  it("describes the menu, not a single Dismiss button", () => {
    expect(fc()).toMatch(/Dismiss is a menu/);
    for (const label of ["Skip this time", "Later", "Stop suggesting", "Move to the Hangar"]) expect(fc()).toContain(label);
    expect(fc()).not.toMatch(/Dismiss is saved per reminder/);
  });

  it("says the picks stay until handled, and a consent card has no Stop", () => {
    expect(fc()).toMatch(/stays on the list until it is handled/);
    expect(fc()).toMatch(/consent card offers Skip and Later only/);
  });

  it("says which choices have Undo: Log contact has none", () => {
    expect(fc()).not.toMatch(/Undo is on the toast\./);
    expect(fc()).toMatch(/Skip, Later and Stop have Undo on the toast; Log contact has none/);
  });
});

describe("the Dispatcher's Next up section (fix 13)", () => {
  it("is a list: every line is a bullet or a bullet's indented continuation", () => {
    const prompt = buildPersonaPrefix("dispatcher");
    const start = prompt.indexOf("TODAY'S NEXT UP");
    expect(start).toBeGreaterThan(-1);
    const lines = prompt.slice(start).split("\n").slice(2);
    const body = lines.slice(0, lines.findIndex((l) => l.startsWith("━")));
    const text = body.filter((l) => l.trim() !== "");
    expect(text.length).toBeGreaterThan(0);
    for (const line of text) expect(line).toMatch(/^(- |  \S)/);
    expect(prompt.slice(start)).toMatch(/- For "who should I call today", use getNextUp/);
  });
});
