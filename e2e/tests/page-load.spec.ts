/**
 * page-load.spec.ts
 *
 * Verifies the initial state of the page immediately after load:
 * all key elements rendered, correct defaults, no stale state.
 */

import { test, expect } from '@playwright/test';
import { mockLookupApi } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockLookupApi(page);
  await page.goto('/');
});

// ---------------------------------------------------------------------------
// Branding & metadata
// ---------------------------------------------------------------------------

test('has correct page title', async ({ page }) => {
  await expect(page).toHaveTitle(/age-mail/);
});

test('shows the main h1 heading', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('age-mail');
});

test('footer shows the injected app version', async ({ page }) => {
  // server.mjs replaces __APP_VERSION__ with "test-1.0.0"
  await expect(page.locator('footer .app-version')).toContainText('test-1.0.0');
});

// ---------------------------------------------------------------------------
// Form elements present
// ---------------------------------------------------------------------------

test('recipients input is present and enabled', async ({ page }) => {
  await expect(page.locator('#recipients-input')).toBeEnabled();
});

test('subject input is present', async ({ page }) => {
  await expect(page.locator('#subject-input')).toBeVisible();
});

test('message textarea is present', async ({ page }) => {
  await expect(page.locator('#body-input')).toBeVisible();
});

test('file drop-zone is visible', async ({ page }) => {
  await expect(page.locator('#drop-zone')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Initial state of interactive elements
// ---------------------------------------------------------------------------

test('send button is disabled on initial load', async ({ page }) => {
  await expect(page.locator('#send-btn')).toBeDisabled();
});

test('progress section is hidden on initial load', async ({ page }) => {
  await expect(page.locator('#progress-section')).toBeHidden();
});

test('trust warning is hidden on initial load', async ({ page }) => {
  await expect(page.locator('#trust-warning')).toBeHidden();
});

test('status message is hidden on initial load', async ({ page }) => {
  await expect(page.locator('#status')).toBeHidden();
});

test('recipients list is empty on initial load', async ({ page }) => {
  await expect(page.locator('#recipients-list')).toBeEmpty();
});

test('file list is empty on initial load', async ({ page }) => {
  await expect(page.locator('#file-list')).toBeEmpty();
});

test('recent-recipients box is hidden when no history exists', async ({ page }) => {
  await expect(page.locator('#recent-recipients')).toBeHidden();
});

// ---------------------------------------------------------------------------
// Copy-URL link
// ---------------------------------------------------------------------------

test('copy-URL link is visible but disabled when no recipients entered', async ({ page }) => {
  const link = page.locator('#copy-url-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveClass(/disabled/);
});

// ---------------------------------------------------------------------------
// Setup / documentation section
// ---------------------------------------------------------------------------

test('setup section is visible', async ({ page }) => {
  await expect(page.locator('.setup-section')).toBeVisible();
});

test('setup section contains DNS and HTTPS instructions', async ({ page }) => {
  const section = page.locator('.setup-section');
  await expect(section).toContainText('DNS TXT record');
  await expect(section).toContainText('HTTPS');
});
