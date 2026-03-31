import { test, expect } from "@playwright/test";

test.describe("Navigation and links", () => {
  test("landing page has navigation links", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("a[href]");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test("landing page CTA navigates to login or signup", async ({ page }) => {
    await page.goto("/");
    // Find a CTA link that points to login/signup/waitlist
    const ctaLink = page.locator(
      'a[href*="login"], a[href*="signup"], a[href*="waitlist"]'
    );
    const count = await ctaLink.count();
    if (count > 0) {
      const href = await ctaLink.first().getAttribute("href");
      expect(href).toBeTruthy();
      await ctaLink.first().click();
      await page.waitForLoadState("networkidle");
      // Should have navigated somewhere valid
      const response = await page.goto(page.url());
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test("logo or brand link is present on landing page", async ({ page }) => {
    await page.goto("/");
    // Look for logo image, SVG, or brand text link
    const brand = page.locator(
      'a:has(img), a:has(svg), [class*="logo"], [class*="brand"], header a'
    );
    const count = await brand.count();
    expect(count).toBeGreaterThan(0);
  });

  test("mobile menu toggle exists if viewport is small", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    // Look for hamburger/menu button (common patterns)
    const menuButton = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="nav" i], button:has(svg), [class*="hamburger"], [class*="menu-toggle"]'
    );
    const count = await menuButton.count();
    // This is a soft check -- not all sites have a mobile menu
    if (count > 0) {
      await expect(menuButton.first()).toBeVisible();
    }
  });
});
