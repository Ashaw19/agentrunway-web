/**
 * Unit tests for the phone app's plain modules (lib/__tests__), run under
 * Node with the expo modules, saved storage (lib/mmkv) and the network
 * (lib/supabase, fetch) mocked in each test. Screens are not tested here.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  // auth-context.tsx (loaded by the data store) needs its JSX compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
