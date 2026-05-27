# UI Tests — Playwright

End-to-end UI tests for the **age-web-gateway** frontend, powered by [Playwright](https://playwright.dev/).

## Prerequisites

1. **Build the frontend** (only needed once, or after changing `web/src/`):

   ```bash
   cd ../web && npm ci --ignore-scripts && node build.mjs
   ```

2. **Install e2e dependencies** (from this directory):

   ```bash
   npm ci
   ```

3. **Install Playwright browsers**:

   ```bash
   npx playwright install chromium
   ```

## Running tests

```bash
# All tests (Chromium, Firefox, WebKit)
npm test

# Chromium only (fastest)
npx playwright test --project=chromium

# Headed mode — watch the browser as it runs
npm run test:headed

# Interactive UI mode (great for debugging individual tests)
npm run test:ui

# Show the last HTML report
npm run test:report
```

## Architecture

| File / Directory | Purpose |
|---|---|
| `playwright.config.ts` | Playwright configuration; starts the dev server via `webServer` |
| `server.mjs` | Lightweight Node.js HTTP server that serves `web/dist/` and replaces Go template tokens (`__POW_DIFFICULTY__` → `0`, etc.) |
| `tests/helpers.ts` | Shared mock helpers for `/api/lookup` and `/api/send` |
| `tests/page-load.spec.ts` | Initial page-render and element-presence checks |
| `tests/privacy-notice.spec.ts` | Privacy-notice display, dismissal, and 30-day TTL |
| `tests/recipients.spec.ts` | Recipient input flow, badge states, trust levels, recent history |
| `tests/send-form.spec.ts` | Send-button enable/disable logic, copy-URL, send flow (success + error) |
| `tests/attachments.spec.ts` | File attachment, drop-zone, size warning |
| `tests/debug-section.spec.ts` | Debug panel (localhost only), PoW difficulty controls |
| `tests/deeplink.spec.ts` | `#to=`, `#body=`, `#subject=` URL fragment pre-fill |

## Key design decisions

- **No real Go server** — the test server (`server.mjs`) serves pre-built static
  files.  All API calls (`/api/lookup`, `/api/send`) are intercepted via
  `page.route()` and return mock JSON.
- **PoW difficulty 0** — the server replaces `__POW_DIFFICULTY__` with `0` so
  any SHA-256 hash satisfies the leading-zero requirement.  This means PoW
  completes in a single crypto call, keeping tests fast.
- **Fresh context per test** — Playwright creates a new browser context (clean
  cookies and `localStorage`) for every test, preventing state leakage.
