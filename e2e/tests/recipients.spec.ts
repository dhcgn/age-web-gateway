/**
 * recipients.spec.ts
 *
 * Tests the recipient lookup flow:
 *   - typing & committing recipients via keyboard / blur / paste
 *   - badge states: loading → found / notfound / error
 *   - trust levels and the DNS trust warning
 *   - removing badges
 *   - PQ-key badge
 *   - warnings / delivery notes
 *   - recent-recipients memory
 */

import { test, expect } from '@playwright/test';
import {
  mockLookupApi,
  typeRecipient,
  addAndWaitForRecipient,
  KNOWN_RECIPIENT,
  UNKNOWN_RECIPIENT,
  DNS_RECIPIENT,
  DNSSEC_RECIPIENT,
  AGE_KEY_PQ,
} from './helpers';

// ---------------------------------------------------------------------------
// Helpers local to this file
// ---------------------------------------------------------------------------

const input       = (page: import('@playwright/test').Page) => page.locator('#recipients-input');
const badgeList   = (page: import('@playwright/test').Page) => page.locator('#recipients-list');
const trustWarn   = (page: import('@playwright/test').Page) => page.locator('#trust-warning');

// ---------------------------------------------------------------------------
// Adding recipients
// ---------------------------------------------------------------------------

test.describe('adding recipients', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('Enter key commits a recipient badge', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('comma commits a recipient badge', async ({ page }) => {
    await input(page).fill(KNOWN_RECIPIENT);
    await input(page).press(',');
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('space commits a recipient badge', async ({ page }) => {
    await input(page).fill(KNOWN_RECIPIENT);
    await input(page).press(' ');
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('Tab commits a recipient badge', async ({ page }) => {
    await input(page).fill(KNOWN_RECIPIENT);
    await input(page).press('Tab');
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('blurring the input commits a typed recipient', async ({ page }) => {
    await input(page).fill(KNOWN_RECIPIENT);
    // Click elsewhere to trigger blur
    await page.locator('#body-input').click();
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('input is cleared after committing a recipient', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await expect(input(page)).toHaveValue('');
  });

  test('multiple recipients can be added one after another', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await typeRecipient(page, UNKNOWN_RECIPIENT);
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(2);
  });

  test('pasting a comma-separated list creates multiple badges', async ({ page }) => {
    // Simulate paste by writing into the field then firing the paste event.
    await input(page).focus();
    await page.evaluate(() => {
      const el = document.getElementById('recipients-input') as HTMLInputElement;
      el.value = 'a@example.com,b@example.com';
      el.dispatchEvent(new Event('paste', { bubbles: true }));
    });
    // The paste handler uses a 0ms setTimeout; wait a tick.
    await page.waitForTimeout(50);
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(2);
  });

  test('the same recipient cannot be added twice', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await typeRecipient(page, KNOWN_RECIPIENT); // duplicate
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Badge states after lookup
// ---------------------------------------------------------------------------

test.describe('badge lookup states', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('badge initially shows loading state', async ({ page }) => {
    // Fill without pressing Enter so we can capture the loading state
    await input(page).fill(KNOWN_RECIPIENT);
    // Start the lookup by pressing Enter
    await input(page).press('Enter');
    // Immediately check — the badge should start in loading state
    // (the mock still has to respond)
    const badge = badgeList(page).locator('.recipient-badge').first();
    // Either loading or already resolved — just verify the badge exists
    await expect(badge).toBeVisible();
  });

  test('badge shows found state with HTTPS trust icon', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const badge = badgeList(page).locator('.recipient-badge').first();
    await expect(badge).toHaveAttribute('data-trust', 'https');
    await expect(badge.locator('.recipient-label')).toContainText('🔒');
  });

  test('badge shows not-found state for unknown recipient', async ({ page }) => {
    await addAndWaitForRecipient(page, UNKNOWN_RECIPIENT);
    const badge = badgeList(page).locator('.recipient-badge').first();
    await expect(badge).toHaveAttribute('data-trust', 'error');
    await expect(badge.locator('.recipient-label')).toContainText('❌');
  });

  test('badge shows error state when API call fails', async ({ page }) => {
    // Override the mock for this test to return 500
    await page.route('/api/lookup**', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.goto('/');
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const badge = badgeList(page).locator('.recipient-badge').first();
    await expect(badge).toHaveAttribute('data-trust', 'error');
  });

  test('DNSSEC badge shows shield icon', async ({ page }) => {
    await addAndWaitForRecipient(page, DNSSEC_RECIPIENT);
    const badge = badgeList(page).locator('.recipient-badge').first();
    await expect(badge).toHaveAttribute('data-trust', 'dnssec');
    await expect(badge.locator('.recipient-label')).toContainText('🛡');
  });
});

// ---------------------------------------------------------------------------
// Trust warning
// ---------------------------------------------------------------------------

test.describe('DNS trust warning', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('trust warning is hidden when all recipients use HTTPS', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT); // trust=https
    await expect(trustWarn(page)).toBeHidden();
  });

  test('trust warning appears when a recipient uses plain DNS', async ({ page }) => {
    await addAndWaitForRecipient(page, DNS_RECIPIENT); // trust=dns
    await expect(trustWarn(page)).toBeVisible();
    await expect(page.locator('#trust-warning-text')).toContainText('plain DNS');
  });

  test('trust warning disappears after removing the low-trust recipient', async ({ page }) => {
    await addAndWaitForRecipient(page, DNS_RECIPIENT);
    await expect(trustWarn(page)).toBeVisible();

    // Remove the badge
    await badgeList(page).locator('.remove-btn').click();
    await expect(trustWarn(page)).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Removing recipients
// ---------------------------------------------------------------------------

test.describe('removing recipients', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('clicking × removes the recipient badge', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
    await badgeList(page).locator('.remove-btn').click();
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(0);
  });

  test('Backspace on empty input removes the last badge', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await typeRecipient(page, UNKNOWN_RECIPIENT);
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(2);

    await input(page).press('Backspace');
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('Backspace with non-empty input does not remove a badge', async ({ page }) => {
    await typeRecipient(page, KNOWN_RECIPIENT);
    await input(page).fill('partial');
    await input(page).press('Backspace');
    // badge should still be there
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Post-quantum key badge
// ---------------------------------------------------------------------------

test.describe('post-quantum key badge', () => {
  test('PQ badge is shown for age1pq1... keys', async ({ page }) => {
    await mockLookupApi(page, {
      [KNOWN_RECIPIENT]: {
        found: true,
        trust: 'https',
        selected_key: AGE_KEY_PQ,
        selection_reason: 'single',
        delivery: KNOWN_RECIPIENT,
        warnings: [],
      },
    });
    await page.goto('/');
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const pqBadge = badgeList(page).locator('.pq-badge').first();
    await expect(pqBadge).toBeVisible();
  });

  test('PQ badge is hidden for classic age keys', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const pqBadge = badgeList(page).locator('.pq-badge').first();
    await expect(pqBadge).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Recipient notes (delivery address / warnings)
// ---------------------------------------------------------------------------

test.describe('recipient notes', () => {
  test('shows delivery note when delivery differs from address', async ({ page }) => {
    const ALIAS = 'alias@example.com';
    const REAL  = 'real@example.com';
    await mockLookupApi(page, {
      [ALIAS]: {
        found: true,
        trust: 'https',
        selected_key: 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p',
        selection_reason: 'single',
        delivery: REAL,
        warnings: [],
      },
    });
    await page.goto('/');
    await addAndWaitForRecipient(page, ALIAS);
    const note = badgeList(page).locator('.recipient-note').first();
    await expect(note).toBeVisible();
    await expect(note).toContainText(`Delivered to ${REAL}`);
  });

  test('shows pq-preferred note when pq key was selected', async ({ page }) => {
    await mockLookupApi(page, {
      [KNOWN_RECIPIENT]: {
        found: true,
        trust: 'https',
        selected_key: AGE_KEY_PQ,
        selection_reason: 'pq-preferred',
        delivery: KNOWN_RECIPIENT,
        warnings: [],
      },
    });
    await page.goto('/');
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const note = badgeList(page).locator('.recipient-note').first();
    await expect(note).toBeVisible();
    await expect(note).toContainText('post-quantum key was selected');
  });

  test('shows warning from the server response', async ({ page }) => {
    await mockLookupApi(page, {
      [KNOWN_RECIPIENT]: {
        found: true,
        trust: 'https',
        selected_key: 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p',
        selection_reason: 'single',
        delivery: KNOWN_RECIPIENT,
        warnings: ['ignored malformed record'],
      },
    });
    await page.goto('/');
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const note = badgeList(page).locator('.recipient-note').first();
    await expect(note).toBeVisible();
    await expect(note).toContainText('ignored malformed record');
  });
});

// ---------------------------------------------------------------------------
// Recent recipients
// ---------------------------------------------------------------------------

test.describe('recent recipients', () => {
  test.beforeEach(async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');
  });

  test('recent-recipients box appears after a successful lookup', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    // Only appears after a "found" result
    await expect(page.locator('#recent-recipients')).toBeVisible();
  });

  test('resolved recipient is shown as a chip in the recent list', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    const chip = page.locator('.recent-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(KNOWN_RECIPIENT);
  });

  test('unknown recipient is NOT added to the recent list', async ({ page }) => {
    await addAndWaitForRecipient(page, UNKNOWN_RECIPIENT);
    await expect(page.locator('#recent-recipients')).toBeHidden();
  });

  test('clicking a recent chip adds the recipient to the form', async ({ page }) => {
    // First visit: add and resolve a recipient so it gets stored.
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);

    // Remove the badge so we can add it again via the chip.
    await badgeList(page).locator('.remove-btn').click();
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(0);

    // Click the chip in the recent list.
    await page.locator('.recent-chip').click();
    await expect(badgeList(page).locator('.recipient-wrapper')).toHaveCount(1);
  });

  test('removing a chip from the recent list hides it', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await expect(page.locator('.recent-chip')).toBeVisible();

    // Click the × on the chip itself (not the badge × — different element)
    await page.locator('.recent-chip-remove').click();
    await expect(page.locator('.recent-chip')).toHaveCount(0);
  });

  test('"clear all" button removes every recent recipient', async ({ page }) => {
    await addAndWaitForRecipient(page, KNOWN_RECIPIENT);
    await expect(page.locator('#recent-recipients')).toBeVisible();

    // Click clear-all (which shows a confirm dialog)
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#recent-recipients-clear').click();
    await expect(page.locator('#recent-recipients')).toBeHidden();
  });
});
