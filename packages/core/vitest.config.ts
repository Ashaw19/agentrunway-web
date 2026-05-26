import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "engines/__tests__/**/*.test.ts",
      "tax-copy/__tests__/**/*.test.ts",
    ],
  },
});
