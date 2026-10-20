/**
 * Small layout and contrast rules on the Next up components (final review,
 * fixes 10 to 12), read from their source:
 *   - "Also waiting" takes its row colours from the theme (no hard-coded
 *     slate or indigo, which read poorly on a dark card), and its chevron is
 *     a colour that shows in dark mode (textDim, not textFaint)
 *   - the welcome's context pill can't push past the screen: its line
 *     shrinks to one line
 *   - every 32pt button on a card has a hitSlop, labelled ones included
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = (file: string) => readFileSync(path.resolve(HERE, "../../components/next-up", file), "utf8");

describe("the Next up components", () => {
  it("Also waiting: theme colours, and a chevron that shows in dark mode (fix 10)", () => {
    const list = source("AlsoWaitingList.tsx");
    expect(list).not.toMatch(/#64748B|#6366F1|rgba\(100,\s*116,\s*139|rgba\(99,\s*102,\s*241/i);
    expect(list).toMatch(/<ChevronRight[^>]*color=\{c\.textDim\}/);
  });

  it("the context pill's line shrinks to one line (fix 11)", () => {
    const header = source("WelcomeHeader.tsx");
    const line = header.slice(header.lastIndexOf("<Text", header.indexOf("{contextLine(context, t)}")), header.indexOf("{contextLine(context, t)}"));
    expect(line).toMatch(/flexShrink: 1/);
    expect(line).toMatch(/numberOfLines=\{1\}/);
  });

  it("every 32pt card button has a hitSlop (fix 12)", () => {
    const card = source("NextUpCard.tsx");
    const pressables = card.split("<Pressable").slice(1).map((p) => p.slice(0, p.indexOf(">\n")));
    const small = pressables.filter((p) => /height: 32/.test(p));
    expect(small.length).toBeGreaterThanOrEqual(2);
    for (const p of small) expect(p).toMatch(/hitSlop=\{6\}/);
  });
});
