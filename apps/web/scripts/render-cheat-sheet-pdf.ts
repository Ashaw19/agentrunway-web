#!/usr/bin/env npx tsx
/**
 * Render the Canadian Realtor Tax Cheat Sheet PDF.
 *
 * Reads the React component at lib/reports/cheat-sheet-pdf-doc.tsx,
 * renders it to a single-page LETTER PDF buffer via @react-pdf/renderer,
 * and writes it to apps/web/public/canadian-realtor-tax-cheat-sheet-2025.pdf.
 *
 * Re-run after editing cheat-sheet-pdf-doc.tsx:
 *   npx tsx scripts/render-cheat-sheet-pdf.ts
 *
 * The output filename intentionally includes the tax year (2025). When the
 * 2026 federal budget rates land, ship a new component + dated file rather
 * than overwriting this one. The landing page CTA points at the latest.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { CheatSheetPDF } from "../lib/reports/cheat-sheet-pdf-doc";

const OUT_PATH = path.resolve(
  __dirname,
  "..",
  "public",
  "canadian-realtor-tax-cheat-sheet-2025.pdf"
);

async function main() {
  console.log("→ Rendering CheatSheetPDF…");
  const buffer = await renderToBuffer(React.createElement(CheatSheetPDF));
  fs.writeFileSync(OUT_PATH, buffer);
  const sizeKb = (buffer.length / 1024).toFixed(1);
  console.log(`✓ Wrote ${OUT_PATH} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error("✗ Render failed:", err);
  process.exit(1);
});
