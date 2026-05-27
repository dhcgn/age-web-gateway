/**
 * Lightweight static-file server for Playwright UI tests.
 *
 * Serves web/dist/ and replaces the Go-injected HTML template tokens with
 * values suitable for testing:
 *
 *   __POW_DIFFICULTY__          → 0  (any hash passes instantly → no spin wait)
 *   __POW_DIFFICULTY_SEND__     → 0  (same for the send path)
 *   __APP_VERSION__             → test-1.0.0
 *   __MAIL_BACKEND_MAX_SIZE_MB__ → 10
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DIST_DIR = join(__dirname, '..', 'web', 'dist');
const PORT     = 4321;

/** Map file extension → MIME type. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain',
};

if (!existsSync(DIST_DIR)) {
  console.error(
    `[test-server] ERROR: ${DIST_DIR} does not exist.\n` +
    `Run "cd web && npm ci --ignore-scripts && node build.mjs" first.`
  );
  process.exit(1);
}

const server = createServer((req, res) => {
  let urlPath = (req.url ?? '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent path traversal
  const filePath = join(DIST_DIR, urlPath);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext         = extname(filePath);
  const contentType = MIME[ext] ?? 'application/octet-stream';
  let   content     = readFileSync(filePath);

  if (ext === '.html') {
    // Replace Go template tokens with test-safe values.
    // Difficulty 0 means any SHA-256 hash satisfies the leading-zero requirement,
    // so the first nonce tried always wins → PoW completes in a single crypto call.
    let html = content.toString('utf-8');
    html = html.split('__POW_DIFFICULTY__').join('0');
    html = html.split('__POW_DIFFICULTY_SEND__').join('0');
    html = html.split('__APP_VERSION__').join('test-1.0.0');
    html = html.split('__MAIL_BACKEND_MAX_SIZE_MB__').join('10');
    content = Buffer.from(html, 'utf-8');
  }

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[test-server] Serving ${DIST_DIR} at http://localhost:${PORT}`);
});
