/**
 * Shared helpers for age-web-gateway Playwright tests.
 *
 * All API endpoints are mocked via page.route() so tests never touch a real
 * Go server.  Set up mocks before page.goto() so they are in place before any
 * in-page fetch fires.
 */

import { type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A recipient whose age key is "discoverable" (mocked as trust=https). */
export const KNOWN_RECIPIENT = 'alice@example.com';

/** A recipient whose lookup returns found=false. */
export const UNKNOWN_RECIPIENT = 'nobody@nxdomain.example';

/** A recipient whose lookup returns trust=dns (triggers trust warning). */
export const DNS_RECIPIENT = 'dns-only@example.com';

/** A recipient whose lookup returns trust=dnssec. */
export const DNSSEC_RECIPIENT = 'secure@example.com';

/** A classic age public key used in mock responses. */
export const AGE_KEY_CLASSIC =
  'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';

/**
 * A post-quantum hybrid age key (starts with "age1pq1").
 * This is a syntactically valid prefix for testing the PQ badge logic.
 */
export const AGE_KEY_PQ =
  'age1pq1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs8f60c';

// ---------------------------------------------------------------------------
// API mock helpers
// ---------------------------------------------------------------------------

/**
 * Mocks GET /api/lookup for every test.
 *
 * Default behaviour:
 *   KNOWN_RECIPIENT   → found, trust=https, classic age key
 *   DNS_RECIPIENT     → found, trust=dns   (triggers trust warning)
 *   DNSSEC_RECIPIENT  → found, trust=dnssec
 *   anything else     → not found
 *
 * Pass `overrides` to replace the response for a specific recipient:
 *   { 'alice@example.com': { found: false } }
 */
export async function mockLookupApi(
  page: Page,
  overrides: Record<string, object> = {},
): Promise<void> {
  await page.route('/api/lookup**', async (route) => {
    const url       = new URL(route.request().url());
    const recipient = url.searchParams.get('recipient') ?? '';

    if (overrides[recipient]) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipient, ...overrides[recipient] }),
      });
      return;
    }

    if (recipient === KNOWN_RECIPIENT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient,
          found: true,
          trust: 'https',
          selected_key: AGE_KEY_CLASSIC,
          selection_reason: 'single',
          delivery: recipient,
          warnings: [],
        }),
      });
    } else if (recipient === DNS_RECIPIENT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient,
          found: true,
          trust: 'dns',
          selected_key: AGE_KEY_CLASSIC,
          selection_reason: 'single',
          delivery: recipient,
          warnings: [],
        }),
      });
    } else if (recipient === DNSSEC_RECIPIENT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipient,
          found: true,
          trust: 'dnssec',
          selected_key: AGE_KEY_CLASSIC,
          selection_reason: 'single',
          delivery: recipient,
          warnings: [],
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipient, found: false, warnings: [] }),
      });
    }
  });
}

/**
 * Mocks POST /api/send with a 200 OK response.
 * Optionally pass a custom response body (must be JSON-serialisable).
 */
export async function mockSendApi(
  page: Page,
  response: object = { ok: true },
  status = 200,
): Promise<void> {
  await page.route('/api/send', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

// ---------------------------------------------------------------------------
// UI action helpers
// ---------------------------------------------------------------------------

/**
 * Types a recipient into the input and presses Enter to commit it as a badge.
 * Returns immediately — the lookup call is asynchronous.
 */
export async function typeRecipient(page: Page, recipient: string): Promise<void> {
  const input = page.locator('#recipients-input');
  await input.fill(recipient);
  await input.press('Enter');
}

/**
 * Types a recipient, presses Enter, and waits for the badge to leave the
 * "loading" state (i.e. the lookup mock has responded).
 */
export async function addAndWaitForRecipient(
  page: Page,
  recipient: string,
): Promise<void> {
  await typeRecipient(page, recipient);
  // Wait until the trust data-attribute is something other than "loading".
  await page.waitForSelector(
    `.recipient-badge:not([data-trust="loading"])`,
    { timeout: 10_000 },
  );
}
