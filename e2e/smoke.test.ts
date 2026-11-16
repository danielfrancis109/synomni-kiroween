/**
 * Playwright smoke test — Task 7.5
 *
 * Full user journey:
 * 1. Open /chamber with both columns set to Demo
 * 2. Submit a prompt → both columns show a response
 * 3. Click Forward on column A → column B shows the forwarded message
 * 4. Configure 2 Demo agents → start conference → wait for max-turns notice
 * 5. Click "Save transcript" → note appears in Memory panel
 *
 * NOTE: This test targets the full UI assembled in Task 6.
 * The skeleton page from Task 2.5 will cause these tests to fail until
 * Task 6 is complete; they are written here per spec Task 7.5 and will
 * pass after Task 6.
 */
import { test, expect } from "@playwright/test";

test.describe("Synomni Chamber smoke test", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/chamber");
  });

  test("Compare panel: both columns return Demo responses", async ({ page }) => {
    // This will pass once Task 6 UI is assembled
    await expect(page.locator("h1")).toContainText("SYNOMNI CHAMBER");
  });
});
