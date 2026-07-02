#!/usr/bin/env node
/**
 * build-mcp-shared.js
 *
 * Copies packages/core TypeScript source files into
 * apps/web/supabase/functions/_shared/core/ so the MCP
 * Edge Function (Deno runtime) can import them directly.
 *
 * Deno runs TypeScript natively but — unlike tsc/Next's bundler —
 * requires explicit file extensions on every relative import/export
 * specifier. packages/core is written without extensions (correct for
 * its Node/Next consumers), so this script rewrites the *copies* only:
 * `from "./organizations"` -> `from "./organizations.ts"`. The
 * canonical packages/core source is never touched.
 *
 * Run before every Edge Function deploy:
 *   pnpm build:mcp-shared
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "packages", "core");
const DEST = path.join(ROOT, "apps", "web", "supabase", "functions", "_shared", "core");

// Matches `from "./foo"` / `from "../bar/baz"` (no extension) in import
// and `export * from "./foo"` statements. Does not touch bare package
// specifiers (no leading '.') or paths that already end in .ts/.tsx/.json.
const EXTENSIONLESS_RELATIVE_IMPORT = /((?:from|import)\s+["'])(\.\.?\/[^"']+?)(["'])/g;

function addDenoExtensions(source) {
  return source.replace(EXTENSIONLESS_RELATIVE_IMPORT, (match, prefix, specifier, suffix) => {
    if (/\.(ts|tsx|json)$/.test(specifier)) return match;
    return `${prefix}${specifier}.ts${suffix}`;
  });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Skip test files and node_modules
    if (entry.name === "__tests__" || entry.name === "node_modules" || entry.name === "dist") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.name.endsWith(".ts")) {
      const source = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(destPath, addDenoExtensions(source));
    }
  }
}

// Wipe and rebuild the destination
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}

copyDir(SRC, DEST);

// Count what was copied
function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}

const total = countFiles(DEST);
console.log(`✓ Copied ${total} files → apps/web/supabase/functions/_shared/core/`);
