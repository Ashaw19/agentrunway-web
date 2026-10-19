import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * The eval harness (evals/README.md): `pnpm --filter agentrunway-web eval`.
 *
 * Runs every `evals/**\/*.eval.ts` suite. The deterministic suites also run
 * in the normal test run (vitest.config.ts). The live-model suites call
 * Anthropic and skip cleanly when ANTHROPIC_API_KEY isn't set.
 */
// Built from the base config (aliases, JSX) with its own `include`:
// mergeConfig would concatenate the two include lists and run every test.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["evals/**/*.eval.ts"],
    // A live call can take a while; deterministic suites finish in ms.
    testTimeout: 120_000,
    // Live suites share one API key: keep them gentle.
    maxConcurrency: 2,
  },
});
