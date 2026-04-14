#!/usr/bin/env node
/**
 * build-mcp-shared.js
 *
 * Copies packages/core TypeScript source files into
 * apps/web/supabase/functions/_shared/core/ so the MCP
 * Edge Function (Deno runtime) can import them directly.
 *
 * Deno runs TypeScript natively — no compilation needed.
 * Relative imports like "../types/database" work because
 * the directory structure is preserved exactly.
 *
 * Run before every Edge Function deploy:
 *   pnpm build:mcp-shared
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "packages", "core");
const DEST = path.join(ROOT, "apps", "web", "supabase", "functions", "_shared", "core");

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
      fs.copyFileSync(srcPath, destPath);
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
