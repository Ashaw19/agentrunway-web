/**
 * REGRESSION TRIPWIRE — batch year-sheet failures must be SURFACED (2026-07-25).
 *
 * Both importers handle a multi-year Excel workbook by looping over each
 * year-named sheet. Tracker-shaped sheets parse in-browser; every other sheet
 * falls back to `/api/import-history`, where a 504 is the EXPECTED failure mode
 * on large sheets (that whole class is what #245/#246 were about).
 *
 * Historically that fallback was guarded by a bare `if (res.ok) { ... }` with
 * NO else: a year that failed extraction was dropped from `results` silently.
 * The user then landed on the preview screen showing 3 of their 5 years, with
 * nothing indicating two were missing — and confirmed an incomplete career
 * history that silently poisons YoY comparisons, seasonal weights (which need
 * 2+ years of data) and every downstream projection. Worse, if EVERY sheet
 * failed, `results` was empty and the user was shown an empty preview with no
 * error at all.
 *
 * The loop lives inline in two large client components, so the failure path
 * can't be exercised as a unit test without mocking fetch + SheetJS + React
 * state (out of proportion for this fix). This test is the honest alternative:
 * a source-level check that each importer's batch loop (a) records per-sheet
 * failures, (b) throws when nothing at all was extracted, and (c) warns when
 * some sheets succeeded and others did not. It proves structure, not runtime
 * behavior.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "../../.."); // apps/web

const IMPORTERS = [
  "app/(app)/history/history-content.tsx",
  "app/(app)/transactions/transactions-history-tab.tsx",
] as const;

describe("REGRESSION — batch import surfaces per-sheet extraction failures", () => {
  for (const rel of IMPORTERS) {
    const src = readFileSync(path.join(WEB_ROOT, rel), "utf8");

    it(`${rel}: batch loop records failed sheets`, () => {
      expect(src).toContain("const failedSheets: string[] = []");
      expect(src).toContain("failedSheets.push(sheetName)");
    });

    it(`${rel}: a non-ok fallback response is captured, never ignored`, () => {
      // The old fail-silent shape was `if (res.ok) { ...push... }` with no else.
      // The fixed shape branches on !res.ok and reads the curated error first.
      expect(src).toContain("lastFailure = await readImportError(res)");
      // No bare positive-only ok-check may remain in either importer.
      expect(src).not.toMatch(/if \(res\.ok\) \{/);
    });

    it(`${rel}: zero extracted years throws instead of showing an empty preview`, () => {
      expect(src).toMatch(/if \(results\.length === 0\) \{/);
      expect(src).toContain("throw new ImportRequestError(lastFailure ??");
    });

    it(`${rel}: a partial batch warns the user which sheets were dropped`, () => {
      expect(src).toMatch(/if \(failedSheets\.length > 0\) \{/);
      const warnIdx = src.indexOf('failedSheets.join(", ")');
      expect(warnIdx).toBeGreaterThan(-1);
      // The warning must name the sheets AND stay a warning (not an error) so
      // the years that DID extract remain importable.
      expect(src.slice(Math.max(0, warnIdx - 400), warnIdx)).toContain("toast.warning");
    });

    it(`${rel}: one sheet's network throw does not abort the whole workbook`, () => {
      // The per-sheet fetch must sit inside its own try/catch that records the
      // failure and continues — otherwise a single flaky sheet loses every year.
      expect(src).toContain("[import] batch sheet failed:");
    });
  }
});
