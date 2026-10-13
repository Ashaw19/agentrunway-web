import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` for Next. A test that imports a .tsx file
  // (the PDF components) needs the JSX compiled; the runtime is React's.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
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
