import { test, expect } from "@playwright/test";

test.describe("Synomni Chamber smoke test (Demo provider)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main workspace
    await page.goto("/chamber");
    await expect(page.locator('[data-testid="chamber-page"]')).toBeVisible({ timeout: 15_000 });
  });

  test("page loads with correct title and panels", async ({ page }) => {
    await expect(page).toHaveTitle(/Synomni Chamber/i);
    await expect(page.locator('[data-testid="chamber-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="compare-panel"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="conference-panel"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="memory-panel"]')).toBeVisible({ timeout: 10_000 });
  });

  test("Compare: submit prompt to both Demo columns, both return responses", async ({ page }) => {
    // Both columns default to Demo — confirm
    await expect(page.locator('[data-testid="col-0-provider"]')).toHaveValue("demo", { timeout: 10_000 });
    await expect(page.locator('[data-testid="col-1-provider"]')).toHaveValue("demo");

    // Type and submit a prompt
    await page.locator('[data-testid="compare-prompt"]').fill("What is the meaning of life?");
    await page.locator('[data-testid="compare-submit"]').click();

    // Both columns should show non-empty, non-error responses
    await expect(page.locator('[data-testid="col-0-response"]')).not.toContainText("No response yet", { timeout: 20_000 });
    await expect(page.locator('[data-testid="col-1-response"]')).not.toContainText("No response yet", { timeout: 20_000 });

    const col0Text = await page.locator('[data-testid="col-0-response"]').textContent();
    const col1Text = await page.locator('[data-testid="col-1-response"]').textContent();
    expect(col0Text?.trim().length).toBeGreaterThan(5);
    expect(col1Text?.trim().length).toBeGreaterThan(5);
  });

  test("Compare: Forward button sends col-A response to col-B", async ({ page }) => {
    // Submit a prompt first
    await page.locator('[data-testid="compare-prompt"]').fill("Describe a black hole briefly.");
    await page.locator('[data-testid="compare-submit"]').click();
    await expect(page.locator('[data-testid="col-0-response"]')).not.toContainText("No response yet", { timeout: 20_000 });

    // Click Forward on column 0
    await page.locator('[data-testid="col-0-forward"]').click();

    // Column 1 should update with a new response (the forwarded critique)
    await expect(page.locator('[data-testid="col-1-response"]')).not.toContainText("No response yet", { timeout: 20_000 });
    const col1Text = await page.locator('[data-testid="col-1-response"]').textContent();
    expect(col1Text?.trim().length).toBeGreaterThan(5);
  });

  test("Conference: start with 2 Demo agents, conference runs to max turns", async ({ page }) => {
    // Both default agents use Demo — set a topic and start
    await page.locator('[data-testid="conf-topic"]').fill("Is determinism compatible with free will?");

    // Set max turns low so the test runs fast
    await page.locator('[data-testid="conf-max-turns"]').fill("4");

    await page.locator('[data-testid="conf-start"]').click();

    // Wait for the conference to complete (max-turns notice)
    await expect(page.locator('[data-testid="conf-complete"]')).toBeVisible({ timeout: 60_000 });

    // At least one turn should appear in the transcript
    await expect(page.locator('[data-testid="turn-0"]')).toBeVisible();

    // Save transcript button should appear
    await expect(page.locator('[data-testid="conf-save-transcript"]')).toBeVisible();
  });

  test("Conference: save transcript creates a note in Memory panel", async ({ page }) => {
    // Run a quick conference
    await page.locator('[data-testid="conf-topic"]').fill("What is consciousness?");
    await page.locator('[data-testid="conf-max-turns"]').fill("2");
    await page.locator('[data-testid="conf-start"]').click();
    await expect(page.locator('[data-testid="conf-complete"]')).toBeVisible({ timeout: 60_000 });

    // Click Save transcript
    await page.locator('[data-testid="conf-save-transcript"]').click();

    // The memory save form should open with the content pre-filled
    await expect(page.locator('[data-testid="memory-save-form"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="note-title"]')).not.toHaveValue("");

    // Click Save note
    await page.locator('[data-testid="note-save-btn"]').click();

    // A note should appear in the note list
    await expect(page.locator('[data-testid="memory-note-list"]')).not.toContainText("No notes saved yet", { timeout: 10_000 });
  });

  test("Memory: can manually create and find a note", async ({ page }) => {
    await page.locator('[data-testid="memory-new-note"]').click();
    await page.locator('[data-testid="note-title"]').fill("Test note from e2e");
    await page.locator('[data-testid="note-content"]').fill("This note was saved by the Playwright smoke test.");
    await page.locator('[data-testid="note-save-btn"]').click();

    await expect(page.locator('[data-testid="memory-note-list"]')).toContainText("Test note from e2e", { timeout: 10_000 });
  });
});
