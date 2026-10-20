/**
 * Sheets size from the window, not a percentage of a wrapper with no height
 * (lib/sheet-height.ts): that capped short sheets at ~326pt and cut off their
 * last rows (the "+" sheet, the Runway Score sheet).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHEET_MAX_SHARE, sheetMaxHeight } from "../sheet-height";

describe("sheetMaxHeight", () => {
  it("is 85% of the window by default, a given share of it, or the points given", () => {
    expect(SHEET_MAX_SHARE).toBe(0.85);
    expect(sheetMaxHeight(874)).toBe(743);
    expect(sheetMaxHeight(874, "92%")).toBe(804);
    expect(sheetMaxHeight(874, 400)).toBe(400);
  });

  it("falls back to the default for a share it can't read", () => {
    expect(sheetMaxHeight(874, "x%" as `${number}%`)).toBe(743);
    expect(sheetMaxHeight(874, "0%")).toBe(743);
  });

  it("the Sheet uses it, and no style caps a sheet with a percentage", () => {
    const sheet = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../components/ui/Sheet.tsx"), "utf8");
    expect(sheet).toMatch(/sheetMaxHeight\(/);
    expect(sheet).not.toMatch(/maxHeight:\s*["']\d+%["']/);
  });
});
