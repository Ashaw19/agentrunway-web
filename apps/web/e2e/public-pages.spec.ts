import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("landing page loads with Agent Runway branding", async ({ page }) => {
    await page.goto("/");
    // The HTML <title> is set per-page for SEO/CTR (currently "Know Where
    // Your Business Stands" — a value-prop headline). It deliberately does
    // not contain "Agent Runway", so this test must NOT assert on title
    // content. Brand verification uses two signals that are stable across
    // marketing copy iterations:
    //   1. body text contains "agent runway" (rendered branding, headers,
    //      footer, copy)
    //   2. og:description contains the brand name (set in app/layout.tsx
    //      and inherited or re-stated on every page — survives title rewrites)
    const body = page.locator("body");
    await expect(body).toBeVisible();
    const pageText = await page.textContent("body");
    expect(pageText?.toLowerCase()).toContain("agent runway");
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      /agent runway/i,
    );
  });

  test("landing page has CTA buttons", async ({ page }) => {
    await page.goto("/");
    // Look for common CTA patterns: sign up, get started, join, etc.
    const ctas = page.locator(
      'a[href*="login"], a[href*="signup"], a[href*="waitlist"], button'
    );
    const count = await ctas.count();
    expect(count).toBeGreaterThan(0);
  });

  test("login page loads with form elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
    // Look for a sign-in / log-in button
    const signInButton = page.locator(
      'button[type="submit"], button:has-text("Sign"), button:has-text("Log")'
    );
    await expect(signInButton.first()).toBeVisible();
  });

  test("terms page loads or redirects gracefully", async ({ page }) => {
    const response = await page.goto("/terms");
    expect(response?.status()).toBeLessThan(500);
  });

  test("privacy page loads or redirects gracefully", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.status()).toBeLessThan(500);
  });

  test("waitlist page loads or redirects gracefully", async ({ page }) => {
    const response = await page.goto("/waitlist");
    expect(response?.status()).toBeLessThan(500);
  });
});
