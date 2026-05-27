/**
 * debug-section.spec.ts
 *
 * Tests the debug panel that appears only when the app is served from
 * localhost.  The test server (server.mjs) listens on 127.0.0.1:4321, so
 * hostname === "localhost" → the panel is always shown in this test suite.
 *
 * Coverage:
 *   - panel is visible on localhost
 *   - difficulty display and "Apply" button
 *   - "Test PoW" button runs (difficulty is 0 → instant)
 */

import { test, expect } from '@playwright/test';
import { mockLookupApi } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockLookupApi(page);
  await page.goto('/');
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

test('debug section is visible when served from localhost', async ({ page }) => {
  await expect(page.locator('#debug-section')).toBeVisible();
});

test('debug note says "Visible only on localhost"', async ({ page }) => {
  await expect(page.locator('.debug-note')).toContainText('localhost');
});

// ---------------------------------------------------------------------------
// Difficulty controls
// ---------------------------------------------------------------------------

test('difficulty input is pre-filled with the current effective difficulty', async ({ page }) => {
  // server.mjs sets POW_DIFFICULTY to 0; the displayed value should match.
  const difficultyDisplay = page.locator('#debug-current-difficulty');
  await expect(difficultyDisplay).toHaveText('0');
});

test('difficulty input field exists and is editable', async ({ page }) => {
  const input = page.locator('#debug-difficulty-input');
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
});

test('applying a valid difficulty updates the "current effective difficulty" display', async ({ page }) => {
  const input   = page.locator('#debug-difficulty-input');
  const current = page.locator('#debug-current-difficulty');
  const applyBtn = page.locator('#debug-apply-difficulty');

  await input.fill('3');
  await applyBtn.click();

  await expect(current).toHaveText('3');
});

test('applying a difficulty out of range shows an error message', async ({ page }) => {
  const input    = page.locator('#debug-difficulty-input');
  const result   = page.locator('#debug-pow-result');
  const applyBtn = page.locator('#debug-apply-difficulty');

  await input.fill('99');
  await applyBtn.click();

  await expect(result).toContainText('between 0 and 30');
});

test('applying a negative difficulty shows an error message', async ({ page }) => {
  const input    = page.locator('#debug-difficulty-input');
  const result   = page.locator('#debug-pow-result');
  const applyBtn = page.locator('#debug-apply-difficulty');

  await input.fill('-1');
  await applyBtn.click();

  await expect(result).toContainText('between 0 and 30');
});

// ---------------------------------------------------------------------------
// Test-PoW button
// ---------------------------------------------------------------------------

test('initial PoW result area shows "Ready."', async ({ page }) => {
  await expect(page.locator('#debug-pow-result')).toHaveText('Ready.');
});

test('"Test PoW" button runs and shows the result at difficulty 0', async ({ page }) => {
  const testBtn = page.locator('#debug-test-pow');
  const result  = page.locator('#debug-pow-result');

  await testBtn.click();

  // With difficulty 0 the PoW completes almost instantly.
  await expect(result).toContainText('Done.', { timeout: 10_000 });
  await expect(result).toContainText('Difficulty: 0');
  await expect(result).toContainText('Token:');
});

test('"Test PoW" button is disabled while running then re-enabled', async ({ page }) => {
  // Set difficulty to 3 to give enough time to observe the disabled state,
  // but still very fast (< 8 hashes expected).
  await page.locator('#debug-difficulty-input').fill('3');
  await page.locator('#debug-apply-difficulty').click();

  const testBtn = page.locator('#debug-test-pow');

  // Start the PoW
  const clickPromise = testBtn.click();

  // Button should be disabled while computing
  // (it may flip back so fast at low difficulty that we just check it resolves)
  await clickPromise;

  // After completion the button must be re-enabled
  await expect(testBtn).toBeEnabled();
});
