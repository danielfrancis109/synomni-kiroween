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
    await expect(page.locator('[data-testid="col-0-response"] [data-role="assistant"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('[data-testid="col-1-response"] [data-role="assistant"]')).toHaveCount(1, { timeout: 20_000 });

    const col0Text = await page.locator('[data-testid="col-0-response"]').textContent();
    const col1Text = await page.locator('[data-testid="col-1-response"]').textContent();
    expect(col0Text?.trim().length).toBeGreaterThan(5);
    expect(col1Text?.trim().length).toBeGreaterThan(5);
  });

  test("Compare: Forward button sends col-A response to col-B", async ({ page }) => {
    // Submit a prompt first
    await page.locator('[data-testid="compare-prompt"]').fill("Describe a black hole briefly.");
    await page.locator('[data-testid="compare-submit"]').click();
    await expect(page.locator('[data-testid="col-0-response"] [data-role="assistant"]')).toHaveCount(1, { timeout: 20_000 });

    // Click Forward on column 0
    await page.locator('[data-testid="col-0-forward"]').click();

    // Column 1 should gain a new response (the forwarded critique)
    await expect(page.locator('[data-testid="col-1-response"] [data-role="assistant"]')).toHaveCount(2, { timeout: 20_000 });
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

  // -------------------------------------------------------------------------
  // Task 10: demo mode that holds up on camera
  // -------------------------------------------------------------------------

  test("Compare (demo): distinct answers, follow-up adds a message, forward shows a critique", async ({ page }) => {
    const col0 = page.locator('[data-testid="col-0-response"] [data-role="assistant"]');
    const col1 = page.locator('[data-testid="col-1-response"] [data-role="assistant"]');

    // Distinct personas by default
    await expect(page.locator('[data-testid="col-0-model"]')).toHaveValue("demo", { timeout: 10_000 });
    await expect(page.locator('[data-testid="col-1-model"]')).toHaveValue("demo-scientist");

    await page.locator('[data-testid="compare-prompt"]').fill("How do volcanoes form under the ocean?");
    await page.locator('[data-testid="compare-submit"]').click();
    await expect(col0).toHaveCount(1, { timeout: 20_000 });
    await expect(col1).toHaveCount(1, { timeout: 20_000 });

    const a1 = (await col0.nth(0).textContent())!.trim();
    const b1 = (await col1.nth(0).textContent())!.trim();
    expect(a1).toMatch(/^\[Demo · /);
    expect(b1).toMatch(/^\[Demo · Scientist\]/);
    expect(a1).not.toBe(b1);
    expect(a1.toLowerCase()).toContain("volcanoes");
    expect(a1).not.toContain("Great question! Empirical observation");

    // Follow-up in column A: a second assistant message that references the first
    await page.locator('[data-testid="col-0-followup"]').fill("Make it harder");
    await page.locator('[data-testid="col-0-followup-send"]').click();
    await expect(col0).toHaveCount(2, { timeout: 20_000 });
    const a2 = (await col0.nth(1).textContent())!.trim();
    expect(a2).not.toBe(a1);
    const a1Opening = a1.replace(/^\[Demo[^\]]*\]\s*/, "").split(/[.!?]/)[0]!.trim();
    expect(a2).toContain(a1Opening);
    await expect(page.locator('[data-testid="col-0-response"] [data-role="user"]').last()).toContainText("Make it harder");

    // Forward A -> B: B shows a critique quoting A's latest answer
    await page.locator('[data-testid="col-0-forward"]').click();
    await expect(col1).toHaveCount(2, { timeout: 20_000 });
    const critique = (await col1.nth(1).textContent())!;
    expect(critique).toContain("Critique of Column A's answer");
    const a2Opening = a2.replace(/^\[Demo[^\]]*\]\s*/, "").split(/[.!?]/)[0]!.trim();
    expect(critique).toContain(a2Opening.slice(0, 30));
    await expect(page.locator('[data-testid="col-1-response"]')).toContainText("Forwarded from Column A");
  });

  test("Compare (demo): different prompts give different answers", async ({ page }) => {
    const col0 = page.locator('[data-testid="col-0-response"] [data-role="assistant"]');
    await page.locator('[data-testid="compare-prompt"]').fill("Why is the sky blue?");
    await page.locator('[data-testid="compare-submit"]').click();
    await expect(col0).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('[data-testid="compare-submit"]')).toBeDisabled();
    await page.locator('[data-testid="compare-prompt"]').fill("Best way to learn the violin as an adult");
    await page.locator('[data-testid="compare-submit"]').click();
    await expect(col0).toHaveCount(2, { timeout: 20_000 });
    expect((await col0.nth(0).textContent())!.trim()).not.toBe((await col0.nth(1).textContent())!.trim());
  });

  test("Conference (demo): 3 agents, round-robin, 6 turns shows varied lines and a PASS badge with reason", async ({ page }) => {
    await page.locator('[data-testid="add-agent"]').click();
    await expect(page.locator('[data-testid="agent-config-2"]')).toBeVisible();
    await page.locator('[data-testid="conf-topic"]').fill("Is determinism compatible with free will?");
    await page.locator('[data-testid="conf-max-turns"]').fill("6");
    await page.locator('[data-testid="conf-start"]').click();
    await expect(page.locator('[data-testid="conf-complete"]')).toBeVisible({ timeout: 60_000 });

    // PASS badge and its reason render
    const badges = page.locator('[data-testid$="-pass"]');
    expect(await badges.count()).toBeGreaterThanOrEqual(1);
    await expect(badges.first()).toBeVisible();
    await expect(badges.first()).toContainText("PASS");
    const reason = page.locator('[data-testid$="-pass-reason"]').first();
    await expect(reason).toBeVisible();
    await expect(reason).toContainText("Nothing new to add");

    // Spoken lines vary (no repeats)
    const turns = page.locator('[data-testid^="turn-"]:not([data-testid$="-pass"]):not([data-testid$="-pass-reason"])');
    const n = await turns.count();
    expect(n).toBeGreaterThanOrEqual(3);
    const spoken: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = turns.nth(i);
      if ((await t.locator('[data-testid$="-pass"]').count()) === 0) {
        spoken.push((await t.locator("p").textContent())!.trim());
      }
    }
    expect(spoken.length).toBeGreaterThanOrEqual(3);
    expect(new Set(spoken).size).toBe(spoken.length);
  });
});
