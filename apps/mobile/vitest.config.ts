/**
 * Unit tests for the phone app's plain modules (lib/__tests__), run under
 * Node with the expo modules, saved storage (lib/mmkv) and the network
 * (lib/supabase, fetch) mocked in each test. Screens are not tested here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // auth-context.tsx (loaded by the data store) needs its JSX compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    // The translation files, as tsconfig.json's paths and Metro find them
    // (the i18n package's exports map would ask for "home.json.json"), so a
    // test can load the app's real i18n setup (lib/i18n.ts).
    alias: [
      {
        find: /^@agent-runway\/i18n\/mobile\/(.+)$/,
        replacement: `${path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/i18n/mobile")}/$1`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
