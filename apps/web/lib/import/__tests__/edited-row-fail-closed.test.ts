/**
 * REGRESSION TRIPWIRE — edited-row lookups must FAIL CLOSED (2026-07-23).
 *
 * Both importers protect hand-edited rows by fetching `edited_at` for the
 * incoming import_external_ids and EXCLUDING edited rows from the re-import
 * upsert. Historically those lookups destructured `data` but discarded the
 * Supabase `error`: on a transient query failure the edited-row set came back
 * empty and the upsert overwrote the user's manual corrections — the exact
 * data loss the feature exists to prevent.
 *
 * The guard logic lives inline in two large client components, so the error
 * path can't be exercised as a unit test without a refactor or a mocked
 * Supabase client (both out of proportion for this fix). This test is the
 * honest alternative: a source-level check that every edited-row lookup
 * (a) destructures its `error` and (b) guards on it before the write.
 * It proves structure, not runtime behavior — see the dogfood suite for the
 * filter semantics themselves.
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

// The edited-row lookup is uniquely identified by this select list.
const LOOKUP_SELECT = `.select("import_external_id, edited_at")`;

describe("REGRESSION — importer edited-row lookups fail closed", () => {
  for (const rel of IMPORTERS) {
    it(`${rel}: every edited-row lookup destructures its error and guards on it`, () => {
      const src = readFileSync(path.join(WEB_ROOT, rel), "utf8");

      // 4 lookup sites per file: {single-save, batch-save} × {client_records, transactions}.
      const lookupCount = src.split(LOOKUP_SELECT).length - 1;
      expect(lookupCount).toBe(4);

      // Each lookup's destructuring must capture the error alongside data.
      const errorCaptures =
        src.match(/error: (?:crExistingErr|txExistingErr)/g) ?? [];
      expect(errorCaptures).toHaveLength(4);

      // Each captured error must be guarded (abort/throw), never dropped.
      const guards = src.match(/if \((?:crExistingErr|txExistingErr)\)/g) ?? [];
      expect(guards).toHaveLength(4);

      // And no lookup may regress to the old fail-open shape: `{ data: x } =`
      // with no error binding, immediately feeding the edited-row select.
      for (const chunk of src.split(LOOKUP_SELECT).slice(0, -1)) {
        // Take the destructuring statement nearest this lookup.
        const destructure = chunk.slice(chunk.lastIndexOf("const { data"));
        expect(destructure).toContain("error:");
      }
    });
  }
});
