/**
 * test-prompt-shim.ts
 *
 * Re-exports TEXT_PROMPT from lib/import-prompt.ts — the single source of truth
 * shared between the production route and the accuracy test runner.
 *
 * Previously this was a manual copy; now it's a direct re-export so tests always
 * use the exact same prompt as production with zero drift.
 */

// Use a relative path (not @/ alias) because this runs outside Next.js via ts-node
export { TEXT_PROMPT } from "../../lib/import-prompt.js";
