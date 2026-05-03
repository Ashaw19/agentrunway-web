import { test, expect } from "@playwright/test";

/** Filter out known benign console errors from third-party scripts and infrastructure */
function filterBenignErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("third-party") &&
      !e.includes("ERR_BLOCKED_BY_CLIENT") &&
      !e.includes("Content Security Policy") &&
      !e.includes("googletagmanager") &&
      !e.includes("_vercel/insights") &&
      !e.includes("_vercel/speed-insights") &&
      !e.includes("MIME type") &&
      !e.includes("Failed to load resource")
  );
}

test.describe("Smoke tests", () => {
  test("GET / returns 200", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
  });

  test("GET /login returns 200", async ({ request }) => {
    const response = await request.get("/login");
    expect(response.status()).toBe(200);
  });

  test("landing page includes expected HTML meta tags", async ({ page }) => {
    await page.goto("/");
    // Check for viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);
    // Check for charset
    const charset = page.locator('meta[charset], meta[http-equiv="Content-Type"]');
    const count = await charset.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("no console errors on landing page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.goto("/");
    // `load` not `networkidle` — production has Sentry replay, Vercel Speed
    // Insights, and other telemetry keeping connections warm; the page never
    // reaches a true network-idle state, so the previous version timed out
    // at 30s and emailed every 6 hours. `load` fires when all sync subresources
    // have loaded — what "page loaded" actually means. We add a 2s settle so
    // late-binding scripts (analytics SDKs, hydration) get caught too.
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    const criticalErrors = filterBenignErrors(errors);
    expect(criticalErrors).toHaveLength(0);
  });

  test("no console errors on login page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.goto("/login");
    // See landing-page note above — kept consistent so future telemetry
    // additions don't surprise us by failing /login the same way.
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    const criticalErrors = filterBenignErrors(errors);
    expect(criticalErrors).toHaveLength(0);
  });
});
