/**
 * deeplink.spec.ts
 *
 * Tests the deep-link / URL-fragment pre-fill feature.
 * Supported fragment parameters: #to=...&body=...&subject=...
 *
 * The app strips the fragment from the URL after applying it
 * (history.replaceState) to avoid leaking the content via Referer headers.
 */

import { test, expect } from '@playwright/test';
import { mockLookupApi, KNOWN_RECIPIENT, UNKNOWN_RECIPIENT } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeParam(value: string): string {
  return encodeURIComponent(value);
}

// ---------------------------------------------------------------------------
// Recipients via #to=
// ---------------------------------------------------------------------------

test.describe('#to deep-link', () => {
  test('recipient from fragment is added as a badge', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto(`/#to=${encodeParam(KNOWN_RECIPIENT)}`);

    await expect(page.locator('.recipient-wrapper')).toHaveCount(1);
    await expect(page.locator('.recipient-label').first()).toContainText(KNOWN_RECIPIENT);
  });

  test('multiple recipients separated by commas are all added', async ({ page }) => {
    await mockLookupApi(page);
    const fragment = `#to=${encodeParam([KNOWN_RECIPIENT, UNKNOWN_RECIPIENT].join(','))}`;
    await page.goto(`/${fragment}`);

    await expect(page.locator('.recipient-wrapper')).toHaveCount(2);
  });

  test('URL fragment is removed after applying deep-link', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto(`/#to=${encodeParam(KNOWN_RECIPIENT)}`);

    const url = page.url();
    expect(url).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// Body via #body=
// ---------------------------------------------------------------------------

test.describe('#body deep-link', () => {
  test('body parameter pre-fills the message textarea', async ({ page }) => {
    await mockLookupApi(page);
    const body = 'Hello from deep link!';
    await page.goto(`/#body=${encodeParam(body)}`);

    await expect(page.locator('#body-input')).toHaveValue(body);
  });

  test('URL fragment is removed after applying body deep-link', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto(`/#body=${encodeParam('test')}`);
    expect(page.url()).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// Subject via #subject=
// ---------------------------------------------------------------------------

test.describe('#subject deep-link', () => {
  test('subject parameter pre-fills the subject input', async ({ page }) => {
    await mockLookupApi(page);
    const subject = 'Important topic';
    await page.goto(`/#subject=${encodeParam(subject)}`);

    await expect(page.locator('#subject-input')).toHaveValue(subject);
  });
});

// ---------------------------------------------------------------------------
// Combined parameters
// ---------------------------------------------------------------------------

test.describe('combined deep-link parameters', () => {
  test('to + body + subject all applied together', async ({ page }) => {
    await mockLookupApi(page);
    const body    = 'Combined body';
    const subject = 'Combined subject';
    await page.goto(
      `/#to=${encodeParam(KNOWN_RECIPIENT)}&body=${encodeParam(body)}&subject=${encodeParam(subject)}`
    );

    await expect(page.locator('.recipient-wrapper')).toHaveCount(1);
    await expect(page.locator('#body-input')).toHaveValue(body);
    await expect(page.locator('#subject-input')).toHaveValue(subject);
    expect(page.url()).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// Empty / no fragment
// ---------------------------------------------------------------------------

test.describe('no fragment', () => {
  test('page loads normally with no fragment — no pre-filled values', async ({ page }) => {
    await mockLookupApi(page);
    await page.goto('/');

    await expect(page.locator('.recipient-wrapper')).toHaveCount(0);
    await expect(page.locator('#body-input')).toHaveValue('');
    await expect(page.locator('#subject-input')).toHaveValue('');
  });
});
