import { test, expect } from "@playwright/test";

test.describe("Login page interactivity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("email input accepts text", async ({ page }) => {
    const emailInput = page.locator(
      'input[type="email"], input[name="email"]'
    );
    await emailInput.fill("test@example.com");
    await expect(emailInput).toHaveValue("test@example.com");
  });

  test("password input accepts text", async ({ page }) => {
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    );
    await passwordInput.fill("testpassword123");
    await expect(passwordInput).toHaveValue("testpassword123");
  });

  test("sign-in button is clickable", async ({ page }) => {
    const signInButton = page.locator(
      'button[type="submit"], button:has-text("Sign"), button:has-text("Log")'
    );
    await expect(signInButton.first()).toBeEnabled();
  });

  test("form shows validation for empty submission", async ({ page }) => {
    const signInButton = page.locator(
      'button[type="submit"], button:has-text("Sign"), button:has-text("Log")'
    );
    await signInButton.first().click();
    // After clicking submit with empty fields, we should still be on login
    // (the form should not navigate away)
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("login");
  });

  test("page has proper title", async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
