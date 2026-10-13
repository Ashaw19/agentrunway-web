/**
 * REGRESSION TRIPWIRE — confetti is drawn on the main thread (2026-10-13).
 *
 * Sentry AGENTRUNWAY-WEB-K, /demo/dashboard:
 *   "Uncaught TypeError: t.getBoundingClientRect is not a function"
 *   at blob:app:///…  (no stack, no error object)
 *
 * canvas-confetti's default cannon, `confetti(opts)`, animates in a web worker
 * on an OffscreenCanvas. When the page is 0×0 at the moment it fires, the
 * worker falls into the library's "measure the canvas" branch and calls
 * getBoundingClientRect on the OffscreenCanvas, which has no such method.
 *
 * Reproduced with the library by itself in four iframes:
 *
 *   default cannon (worker), 0×0 frame      → the error above, from a blob: script
 *   default cannon (worker), 300×200 frame  → no error
 *   create(…, { useWorker: false }), 0×0    → no error
 *   create(…, { useWorker: false }), sized  → no error
 *
 * The dashboard fires confetti on load when a goal milestone is passed, and
 * the demo dashboard always has one, so any zero-size visitor (a preview
 * renderer, an automated check, a hidden frame) threw on every load.
 *
 * The behaviour needs a real browser, a worker and a canvas, so this pins
 * the two things that produce it: how the hook builds its cannon, and that
 * the hook is the only place the library is imported.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const HOOK = "hooks/use-confetti.ts";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(WEB, dir));
  return out;
}

describe("REGRESSION — confetti never runs in canvas-confetti's worker", () => {
  const hook = readFileSync(path.join(WEB, HOOK), "utf8");
  // Comments describe the default cannon by name; only code counts.
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the hook builds its own cannon with the worker off", () => {
    expect(code).toMatch(/confetti\.create\(\s*undefined\s*,\s*\{[^}]*useWorker:\s*false[^}]*\}\s*\)/);
    expect(code).not.toMatch(/useWorker:\s*true/);
  });

  it("the hook never calls the library's default (worker) cannon", () => {
    // `confetti(` is the default cannon; `confetti.create(` and `confetti.Options` are fine.
    expect(code).not.toMatch(/(?<![.\w])confetti\s*\(/);
  });

  it("the hook does nothing on a page with no size", () => {
    expect(code).toMatch(/if \(!pageHasSize\(\)\) return;/);
  });

  it("nothing else imports canvas-confetti, so nothing else can reach the default cannon", () => {
    const importers = ["app", "components", "hooks", "lib"]
      .flatMap(sourceFiles)
      .filter((f) => /from\s+["']canvas-confetti["']|require\(\s*["']canvas-confetti["']\s*\)/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(WEB, f).split(path.sep).join("/"));
    expect(importers).toEqual([HOOK]);
  });
});
