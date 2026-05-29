import { test, expect } from "@playwright/test";

/**
 * UI / SPA flow e2e.
 * Drives the actual single-page app through a real browser to confirm the
 * public surface renders and the login gate works without a backend regression.
 */

test.describe("SPA public surface", () => {
  test("home page loads the YapayZekaLab shell", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText("YapayZeka");
    await expect(page).toHaveTitle(/.+/);
  });

  test("login gate renders Google sign-in for anonymous users", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Google ile/i).first()).toBeVisible();
  });

  test("no uncaught console errors on initial load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
