/**
 * Playwright e2e tests for hosted-demo mode (HOSTED_DEMO=true).
 *
 * Assertions:
 *   1. The Local provider option is absent from all provider pickers.
 *   2. Notes saved in one browser context (session) are not visible in another.
 */
import { test, expect, chromium } from "@playwright/test";

test.describe("Hosted-demo mode — Local provider hidden", () => {
  test("Local option is absent from ComparePanel provider pickers", async ({
    page,
  }) => {
    await page.goto("/chamber");
    await expect(
      page.locator('[data-testid="chamber-page"]')
    ).toBeVisible({ timeout: 15_000 });

    // Wait briefly for /api/config fetch to settle
    await page.waitForTimeout(1500);

    // Column 0 provider selector must not contain a "local" option
    const col0Options = await page
      .locator('[data-testid="col-0-provider"] option')
      .allTextContents();
    expect(col0Options.some((t) => t.toLowerCase().includes("local"))).toBe(
      false
    );

    // Column 1 provider selector
    const col1Options = await page
      .locator('[data-testid="col-1-provider"] option')
      .allTextContents();
    expect(col1Options.some((t) => t.toLowerCase().includes("local"))).toBe(
      false
    );
  });

  test("Local option is absent from ConferencePanel agent pickers", async ({
    page,
  }) => {
    await page.goto("/chamber");
    await expect(
      page.locator('[data-testid="chamber-page"]')
    ).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);

    // Check the first agent's provider select
    const agentProviders = page.locator('[data-testid^="agent-provider-"]');
    const count = await agentProviders.count();
    for (let i = 0; i < count; i++) {
      const opts = await agentProviders.nth(i).locator("option").allTextContents();
      expect(opts.some((t) => t.toLowerCase().includes("local"))).toBe(false);
    }
  });
});

test.describe("Hosted-demo mode — session isolation", () => {
  test("notes saved in context A are not visible in context B", async ({
    browser,
  }) => {
    // Two independent browser contexts simulate two different users.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Both navigate to the app
    await pageA.goto("/chamber");
    await pageB.goto("/chamber");
    await expect(pageA.locator('[data-testid="chamber-page"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageB.locator('[data-testid="chamber-page"]')).toBeVisible({
      timeout: 15_000,
    });

    // Context A saves a note
    await pageA.locator('[data-testid="memory-new-note"]').click();
    await pageA
      .locator('[data-testid="note-title"]')
      .fill("Context A exclusive note");
    await pageA
      .locator('[data-testid="note-content"]')
      .fill("This note belongs to context A only.");
    await pageA.locator('[data-testid="note-save-btn"]').click();
    await expect(
      pageA.locator('[data-testid="memory-note-list"]')
    ).toContainText("Context A exclusive note", { timeout: 10_000 });

    // Context B should NOT see context A's note
    // Reload context B to get fresh data from the server
    await pageB.reload();
    await expect(pageB.locator('[data-testid="chamber-page"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      pageB.locator('[data-testid="memory-note-list"]')
    ).not.toContainText("Context A exclusive note");

    await ctxA.close();
    await ctxB.close();
  });
});
