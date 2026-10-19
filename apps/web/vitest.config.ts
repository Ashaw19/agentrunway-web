import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` for Next. A test that imports a .tsx file
  // (the PDF components) needs the JSX compiled; the runtime is React's.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
    // The eval harness's deterministic suites are fast, so they gate every
    // run too; the live-model ones run only with `pnpm eval` (evals/README.md).
    include: ["lib/**/__tests__/**/*.test.ts", "evals/deterministic/**/*.eval.ts"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./") },
      // The MCP edge function imports packages/core through its Deno copy,
      // `supabase/functions/_shared/core/**.ts`, which only exists after
      // `pnpm build:mcp-shared` (gitignored). The copy is packages/core with
      // file extensions added, so tests that run the real tool handlers
      // (lib/mcp-server/__tests__/tool-harness.ts) read the source instead.
      {
        find: /^(?:\.\.?\/)+_shared\/core\/(.+)\.ts$/,
        replacement: `${path.resolve(__dirname, "../../packages/core")}/$1`,
      },
    ],
  },
});
