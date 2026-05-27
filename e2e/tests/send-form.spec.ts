/**
 * send-form.spec.ts
 *
 * Tests the send button enable/disable logic, the subject warning, copy-URL
 * link, and the overall send flow (progress → success / error) using mocked
 * API endpoints.
 */

import { test, expect } from '@playwright/test';
import {
  mockLookupApi,
  mockSendApi,
  addAndWaitForRecipient,
  typeRecipient,
  KNOWN_RECIPIENT,
  UNKNOWN_RECIPIENT,
} from './helpers';

// ---------------------------------------------------------------------------
// Send-button enable / disable
// ---------------------------------------------------------------------------

test.describe('send button state', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await mockSendApi(page);
    await page.goto('/');
  });

  test('disabled with no recipients and no message', async ({ page }) => {
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('disabled with a message but no recipients', async ({ page }) => {
    await page.locator('#body-input').fill('Hello!');
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('disabled with a resolved recipient but no message', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('disabled when recipient lookup returned not-found', async ({ page }) => {
    await addAndWaitForRecipient(page, UNKNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Hello!');
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('enabled when recipient is resolved AND message is present', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Hello!');
    await expect(page.locator('#send-btn')).toBeEnabled();
  });

  test('disabled again after removing the resolved recipient', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Hello!');
    await expect(page.locator('#send-btn')).toBeEnabled();

    await page.locator('.remove-btn').click();
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('disabled again after clearing the message body', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Hello!');
    await expect(page.locator('#send-btn')).toBeEnabled();

    await page.locator('#body-input').fill('');
    await page.locator('#body-input').dispatchEvent('input');
    await expect(page.locator('#send-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Subject field warnings
// ---------------------------------------------------------------------------

test.describe('subject field', () => {
  test('subject warning is visible (subject is always plaintext)', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
    await expect(page.locator('#subject-warning')).toBeVisible();
    await expect(page.locator('#subject-warning')).toContainText('not encrypted');
  });
});

// ---------------------------------------------------------------------------
// Copy-URL link
// ---------------------------------------------------------------------------

test.describe('copy-URL link', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('link is visible but disabled on load', async ({ page }) => {
    const link = page.locator('#copy-url-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveClass(/disabled/);
  });

  test('link becomes enabled after typing a recipient (before commit)', async ({ page }) => {
    await page.locator('#recipients-input').fill(KNOWN_RECIPIENT);
    // Trigger input event so updateUI fires
    await page.locator('#recipients-input').dispatchEvent('input');
    const link = page.locator('#copy-url-link');
    await expect(link).not.toHaveClass(/disabled/);
  });

  test('link stays enabled after committing a recipient', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    const link = page.locator('#copy-url-link');
    await expect(link).not.toHaveClass(/disabled/);
  });

  test('clicking the link copies the URL to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await typeRecipient(page, KNOWN_RECIPIENT);
    const link = page.locator('#copy-url-link');
    await expect(link).not.toHaveClass(/disabled/);
    await link.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('#to=');
    expect(copied).toContain(encodeURIComponent(KNOWN_RECIPIENT));
  });

  test('clicking the link briefly shows "Copied!" feedback', async ({ page, context }) => {
    // Clipboard write permission is required for navigator.clipboard.writeText() to succeed,
    // which in turn triggers the "Copied!" feedback in the .then() callback.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await typeRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#copy-url-link').click();
    await expect(page.locator('#copy-url-link')).toContainText('Copied!');
    // After ~1.5 s it reverts to original text
    await expect(page.locator('#copy-url-link')).toContainText('Copy link', { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Send flow (success)
// ---------------------------------------------------------------------------

test.describe('send flow — success', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await mockSendApi(page);
    await page.goto('/');
  });

  test('progress section is shown while sending', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Secret message');

    // Intercept the send request so we can observe intermediate UI state.
    let resolveRequest!: () => void;
    const requestPaused = new Promise<void>((r) => { resolveRequest = r; });

    // Override the send route to pause before responding.
    await page.route('/api/send', async (route) => {
      resolveRequest();
      await new Promise<void>((r) => setTimeout(r, 200)); // brief pause
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const clickPromise = page.locator('#send-btn').click();
    await requestPaused;

    // While the request is in-flight the progress section should be visible.
    await expect(page.locator('#progress-section')).toBeVisible();

    await clickPromise;
  });

  test('shows success status after a successful send', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Secret message');
    await page.locator('#send-btn').click();
    await expect(page.locator('#status')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#status')).toHaveClass(/success/);
    await expect(page.locator('#status')).toContainText('sent');
  });

  test('form is reset after a successful send', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Secret message');
    await page.locator('#subject-input').fill('Test subject');
    await page.locator('#send-btn').click();
    await expect(page.locator('#status')).toBeVisible({ timeout: 15_000 });

    // Recipients list and body should be cleared.
    await expect(page.locator('#recipients-list')).toBeEmpty();
    await expect(page.locator('#body-input')).toHaveValue('');
    await expect(page.locator('#subject-input')).toHaveValue('');
  });

  test('download-record button appears after a successful send', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Secret message');
    await page.locator('#send-btn').click();
    await expect(page.locator('.record-download-btn')).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Send flow (server error)
// ---------------------------------------------------------------------------

test.describe('send flow — error', () => {
  test('shows error status when the server returns 500', async ({ page }) => {
    await mockLookupApi(page);
    await mockSendApi(page, { error: 'internal server error' }, 500);
    await page.goto('/');

    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await page.locator('#body-input').fill('Secret message');
    await page.locator('#send-btn').click();

    await expect(page.locator('#status')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#status')).toHaveClass(/error/);
  });
});
