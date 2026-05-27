/**
 * privacy-notice.spec.ts
 *
 * Tests the privacy notice banner:
 *   - shown on first visit (clean localStorage)
 *   - dismissable via the × button
 *   - hidden after dismissal
 *   - re-shown after 30 days (simulated via stale localStorage timestamp)
 *   - not shown again during the same 30-day window
 */

import { test, expect, type Page } from '@playwright/test';
import { mockLookupApi } from './helpers';

const STORAGE_KEY  = 'agemail.privacy-notice-dismissed-at';
const TTL_MS       = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Helper: force a "fresh" (never dismissed) or "stale" storage state
// ---------------------------------------------------------------------------

async function setPrivacyDismissedAt(page: Page, timestamp: number): Promise<void> {
  await page.evaluate(
    ([key, ts]) => localStorage.setItem(key, String(ts)),
    [STORAGE_KEY, timestamp] as [string, number],
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await mockLookupApi(page);
});

test('privacy notice is visible on a first visit (no localStorage entry)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#privacy-notice')).toBeVisible();
});

test('privacy notice has a dismiss button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#privacy-notice-dismiss')).toBeVisible();
});

test('clicking dismiss hides the privacy notice', async ({ page }) => {
  await page.goto('/');
  await page.locator('#privacy-notice-dismiss').click();
  await expect(page.locator('#privacy-notice')).toBeHidden();
});

test('dismissal is persisted to localStorage', async ({ page }) => {
  await page.goto('/');
  await page.locator('#privacy-notice-dismiss').click();

  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(stored).not.toBeNull();
  const ts = parseInt(stored!, 10);
  expect(ts).toBeGreaterThan(0);
  // The stored timestamp should be close to "now".
  expect(ts).toBeGreaterThan(Date.now() - 5000);
});

test('privacy notice is hidden when dismissed recently (within 30 days)', async ({ page }) => {
  // Pre-seed a dismissal timestamp that is just 1 hour old.
  await page.goto('/');
  await setPrivacyDismissedAt(page, Date.now() - 60 * 60 * 1000);
  await page.reload();
  await expect(page.locator('#privacy-notice')).toBeHidden();
});

test('privacy notice is shown again after 30 days have elapsed', async ({ page }) => {
  // Pre-seed a timestamp that is 31 days old → expired.
  await page.goto('/');
  await setPrivacyDismissedAt(page, Date.now() - (TTL_MS + 24 * 60 * 60 * 1000));
  await page.reload();
  await expect(page.locator('#privacy-notice')).toBeVisible();
});

test('privacy notice lists the key privacy points', async ({ page }) => {
  await page.goto('/');
  const notice = page.locator('#privacy-notice');
  await expect(notice).toContainText("recipient's email address is visible");
  await expect(notice).toContainText('message content');
  await expect(notice).toContainText('Encryption happens in your browser');
});
