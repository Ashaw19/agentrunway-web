/**
 * The MCP edge function's import graph resolves the way Deno resolves it.
 *
 * Nothing local checks the edge function: `supabase/functions` is outside
 * tsconfig, and a broken import only shows at deploy, or as a 500 on the
 * first call. The tools import packages/core through a generated copy
 * (`scripts/build-mcp-shared.js` → `supabase/functions/_shared/core`), which
 * is packages/core with `.ts` added to each relative import. So an engine
 * that is fine under Node can still break the deployed function:
 *
 *   - a relative import the build script's regex doesn't rewrite
 *     (a dynamic `import("./x")`, a directory import of `./x/index.ts`)
 *   - a bare package import (`zod`): the function has no import map
 *   - an import of a file that isn't there
 *
 * This walks the graph from `mcp-server/index.ts`, following `_shared/core`
 * into packages/core, and applies those rules. It reads source only; it does
 * not run Deno.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { WEB_ROOT } from "./registry-source";

const FUNCTIONS_DIR = path.join(WEB_ROOT, "supabase/functions");
const SHARED_CORE = path.join(FUNCTIONS_DIR, "_shared/core");
const CORE_DIR = path.resolve(WEB_ROOT, "../../packages/core");
const ENTRY = path.join(FUNCTIONS_DIR, "mcp-server/index.ts");

/** `import … from "x"`, `export … from "x"`, `import "x"`. */
const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(/;
/** The build script's rewrite rule (scripts/build-mcp-shared.js). */
const BUILD_SCRIPT_REWRITES = /((?:from|import)\s+["'])(\.\.?\/[^"']+?)(["'])/g;
const DENO_REMOTE = /^(?:npm|jsr|node|https?):/;

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const inCore = (file: string) => file.startsWith(CORE_DIR + path.sep);
const rel = (file: string) => path.relative(path.resolve(WEB_ROOT, "../.."), file).split(path.sep).join("/");

function specifiers(src: string): string[] {
  return [...src.matchAll(STATIC_IMPORT)].map((m) => m[1] ?? m[2]);
}

interface Graph {
  files: string[];
  problems: string[];
}

function walk(entry: string): Graph {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);

    const src = stripComments(readFileSync(file, "utf8"));
    const core = inCore(file);
    if (core && DYNAMIC_IMPORT.test(src)) {
      problems.push(`${rel(file)}: dynamic import() is not rewritten by build-mcp-shared.js`);
    }
    const rewritten = new Set([...src.matchAll(BUILD_SCRIPT_REWRITES)].map((m) => m[2]));

    for (const spec of specifiers(src)) {
      if (!spec.startsWith(".")) {
        // A bare specifier: fine in the function itself when Deno can fetch
        // it; never fine in packages/core, which the function has no import
        // map for.
        if (core || !DENO_REMOTE.test(spec)) problems.push(`${rel(file)}: bare import "${spec}"`);
        continue;
      }

      let target: string;
      if (core) {
        // packages/core omits extensions; the copy gets `.ts` appended.
        if (!rewritten.has(spec)) problems.push(`${rel(file)}: "${spec}" is not matched by the build script's rewrite`);
        target = path.resolve(path.dirname(file), /\.(?:ts|tsx|json)$/.test(spec) ? spec : `${spec}.ts`);
      } else {
        if (!spec.endsWith(".ts")) problems.push(`${rel(file)}: "${spec}" needs an explicit .ts extension for Deno`);
        const resolved = path.resolve(path.dirname(file), spec);
        // The generated copy stands in for packages/core.
        target = resolved.startsWith(SHARED_CORE + path.sep)
          ? path.join(CORE_DIR, path.relative(SHARED_CORE, resolved))
          : resolved;
      }

      if (!isFile(target)) {
        problems.push(`${rel(file)}: "${spec}" does not resolve to a file (${rel(target)})`);
        continue;
      }
      queue.push(target);
    }
  }

  return { files: [...seen].map(rel).sort(), problems };
}

describe("MCP edge function — imports resolve under Deno", () => {
  const graph = walk(ENTRY);

  it("walks the whole function, into packages/core (guards against a broken walker)", () => {
    for (const must of [
      "apps/web/supabase/functions/mcp-server/tools/analytics.ts",
      "apps/web/supabase/functions/mcp-server/tools/expenses.ts",
      "apps/web/supabase/functions/mcp-server/lib/expense-inputs.ts",
      "packages/core/lib/local-date.ts",
      "packages/core/engines/expense-totals-engine.ts",
      "packages/core/engines/gst34-engine.ts",
      "packages/core/engines/recurring-expense-engine.ts",
      "packages/core/engines/filing-period-engine.ts",
      "packages/core/types/database.ts",
    ]) {
      expect(graph.files).toContain(must);
    }
  });

  it("every import is one Deno and the build script can resolve", () => {
    expect(graph.problems).toEqual([]);
  });

  it("the rules catch the shapes that break a deploy", () => {
    const first = (src: string) => specifiers(stripComments(src));
    expect(first(`import { a } from "./a";\nexport * from "../b";\nimport type { C } from "npm:c@2";`)).toEqual(["./a", "../b", "npm:c@2"]);
    expect(first(`import {\n  a,\n  type B,\n} from "../../_shared/core/engines/x.ts";`)).toEqual(["../../_shared/core/engines/x.ts"]);
    expect(first(`// import { a } from "./commented-out";`)).toEqual([]);
    expect(DYNAMIC_IMPORT.test(`const m = await import("./x");`)).toBe(true);
    expect(DENO_REMOTE.test("npm:@supabase/supabase-js@2")).toBe(true);
    expect(DENO_REMOTE.test("zod")).toBe(false);
  });
});
