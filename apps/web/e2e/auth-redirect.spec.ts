import { test, expect } from "@playwright/test";

test.describe("Auth redirects for protected routes", () => {
  const protectedRoutes = [
    "/dashboard",
    "/scenarios",
    "/transactions",
    "/clients",
    "/settings",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated users to login`, async ({
      page,
    }) => {
      await page.goto(route);
      // Should end up on the login page (or a URL containing "login")
      await page.waitForURL(/login/, { timeout: 10000 });
      expect(page.url()).toContain("login");
    });
  }
});
