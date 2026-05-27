/**
 * attachments.spec.ts
 *
 * Tests the file-attachment UI:
 *   - selecting files via the hidden <input type="file">
 *   - drop-zone styling
 *   - file list rendering (name + size)
 *   - removing individual files
 *   - the oversized-file warning
 *   - send-button state with attachment only (no message body)
 */

import { test, expect } from '@playwright/test';
import { mockLookupApi, mockSendApi, addAndWaitForRecipient, KNOWN_RECIPIENT } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attaches a synthetic File to the hidden <input type="file"> and dispatches
 * a "change" event so the app processes it, mimicking user file selection.
 */
async function attachFile(
  page: import('@playwright/test').Page,
  name: string,
  content: string,
  type = 'text/plain',
): Promise<void> {
  await page.evaluate(
    ([n, c, t]) => {
      const input = document.getElementById('file-input') as HTMLInputElement;
      const file  = new File([c], n, { type: t });
      const dt    = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [name, content, type] as [string, string, string],
  );
}

// ---------------------------------------------------------------------------
// File list rendering
// ---------------------------------------------------------------------------

test.describe('file list', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('attached file appears in the file list', async ({ page }) => {
    await attachFile(page, 'secret.txt', 'Hello');
    await expect(page.locator('#file-list li')).toHaveCount(1);
    await expect(page.locator('#file-list li').first()).toContainText('secret.txt');
  });

  test('file size is shown next to the file name', async ({ page }) => {
    await attachFile(page, 'data.txt', 'A'.repeat(1024)); // 1 KB
    const item = page.locator('#file-list li').first();
    await expect(item).toContainText('KB');
  });

  test('multiple files can be attached', async ({ page }) => {
    await attachFile(page, 'a.txt', 'aaa');
    await attachFile(page, 'b.txt', 'bbb');
    await expect(page.locator('#file-list li')).toHaveCount(2);
  });

  test('remove button deletes the file from the list', async ({ page }) => {
    await attachFile(page, 'remove-me.txt', 'data');
    await expect(page.locator('#file-list li')).toHaveCount(1);
    await page.locator('#file-list li button').click();
    await expect(page.locator('#file-list li')).toHaveCount(0);
  });

  test('removing one file leaves the others intact', async ({ page }) => {
    await attachFile(page, 'keep.txt', 'keep');
    await attachFile(page, 'remove.txt', 'bye');
    await expect(page.locator('#file-list li')).toHaveCount(2);
    // Remove the second one (last button)
    await page.locator('#file-list li button').last().click();
    await expect(page.locator('#file-list li')).toHaveCount(1);
    await expect(page.locator('#file-list li').first()).toContainText('keep.txt');
  });
});

// ---------------------------------------------------------------------------
// Drop-zone styling
// ---------------------------------------------------------------------------

test.describe('drop-zone', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('drop-zone gains "dragover" class on dragover event', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    await dropZone.dispatchEvent('dragover', { bubbles: true });
    await expect(dropZone).toHaveClass(/dragover/);
  });

  test('drop-zone loses "dragover" class on dragleave event', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    await dropZone.dispatchEvent('dragover', { bubbles: true });
    await dropZone.dispatchEvent('dragleave', { bubbles: true });
    await expect(dropZone).not.toHaveClass(/dragover/);
  });
});

// ---------------------------------------------------------------------------
// Oversized-file warning
// ---------------------------------------------------------------------------

test.describe('size warning', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('size warning is hidden when total payload is within limit', async ({ page }) => {
    await attachFile(page, 'small.txt', 'tiny');
    await expect(page.locator('#size-warning')).toBeHidden();
  });

  test('size warning appears when total payload exceeds the configured limit', async ({ page }) => {
    // server.mjs sets __MAIL_BACKEND_MAX_SIZE_MB__ to 10, so 11 MB should trigger the warning.
    const elevenMB = 'X'.repeat(11 * 1024 * 1024);
    await attachFile(page, 'huge.bin', elevenMB, 'application/octet-stream');
    await expect(page.locator('#size-warning')).toBeVisible();
    await expect(page.locator('#size-warning-text')).toContainText('exceeds');
  });

  test('size warning disappears after the large file is removed', async ({ page }) => {
    const elevenMB = 'X'.repeat(11 * 1024 * 1024);
    await attachFile(page, 'huge.bin', elevenMB, 'application/octet-stream');
    await expect(page.locator('#size-warning')).toBeVisible();

    await page.locator('#file-list li button').click();
    await expect(page.locator('#size-warning')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Send-button state with attachments only
// ---------------------------------------------------------------------------

test.describe('send button with attachments', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await mockSendApi(page);
    await page.goto('/');
  });

  test('send button remains disabled with a file but no resolved recipient', async ({ page }) => {
    await attachFile(page, 'secret.txt', 'Hello');
    await expect(page.locator('#send-btn')).toBeDisabled();
  });

  test('send button is enabled with a resolved recipient and an attachment (no body text)', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await attachFile(page, 'secret.txt', 'Hello');
    // No body text needed — attachment alone counts as "content"
    await expect(page.locator('#send-btn')).toBeEnabled();
  });
});
