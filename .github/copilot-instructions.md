# Copilot Instructions — age-web-gateway

## Build & Run

### Frontend (web/)
```bash
cd web && npm ci --ignore-scripts && node build.mjs
```
Output lands in `web/dist/` (embedded into the Go binary via `web/embed.go`).
Use `node build.mjs --watch` for dev iteration.

### Backend
```bash
go build ./cmd/agemail
./agemail -config config.json
```
Version injection: `go build -ldflags "-X main.buildVersion=v1.2.3" ./cmd/agemail`

### Release
```bash
git tag v0.0.8 && git push origin v0.0.8
```
Pushing a `v*` tag triggers the release workflow.

### Tests
```bash
go test ./internal/...                           # all unit tests
go test ./internal/pow                            # single package
go test -run TestVerify ./internal/pow            # single test
go test -tags integration ./internal/mail         # integration tests (need env vars)
```
Integration tests use build tag `//go:build integration` and skip automatically when credentials are absent.

### Lint
```bash
go vet ./...
```

## Architecture

Single Go binary serves both API and embedded frontend. No database — only an in-memory PoW replay cache.

**Request flow:** Browser encrypts content with age → solves proof-of-work → `POST /api/send` → backend relays opaque ciphertext via SMTP or Cloudflare Email API. The backend never sees plaintext.

### Key components

| Package | Role |
|---|---|
| `cmd/agemail` | Entrypoint. Wires config, services, routes. Injects runtime values (`__POW_DIFFICULTY__`, `__APP_VERSION__`) into `index.html` at startup. |
| `internal/config` | JSON file + env var config with precedence: defaults → file → env. |
| `internal/lookup` | Recipient key discovery via DNS TXT (with DNSSEC detection) and HTTPS `/.well-known/age`. Returns keys + trust level. |
| `internal/pow` | SHA-256 proof-of-work verification and replay cache with TTL-based eviction. |
| `internal/mail` | `Sender` interface with two implementations: `Service` (SMTP) and `CloudflareService`. MIME assembly in `mime.go`. |
| `internal/api` | HTTP handlers for `/api/lookup`, `/api/send`, `/healthz`. PoW middleware gates all `/api/*` routes. CSP and CORS middleware. |
| `web/src/` | TypeScript frontend using `age-encryption` (typage) for client-side encryption. esbuild bundles to `web/dist/`. |

### Mail backends
Selected by `MAIL_BACKEND` env var (or `mail_backend` in config JSON). Default is `smtp`. The `Sender` interface (`internal/mail/sender.go`) abstracts delivery — add new backends by implementing `Send(Payload) error`.

### Frontend build pipeline
`web/build.mjs` uses esbuild to bundle `web/src/main.ts` → `web/dist/app.js`, then copies `index.html` and `styles.css`. The Go binary embeds `web/dist/` via `//go:embed all:dist` in `web/embed.go`.

## Conventions

- **Config precedence:** hardcoded defaults → JSON config file → environment variables (highest priority). See `internal/config/config.go`.
- **Two PoW difficulties:** `pow_difficulty` for API lookups (low) and `pow_difficulty_mail_send` for sending mail (high, default 20).
- **Structured logging** with `log/slog` throughout. Log level is configurable.
- **No external CDN/runtime deps.** All JS/CSS/WASM is served by the binary itself. CSP enforces `default-src 'self'`.
- **Trust levels** for recipient key discovery: `https` (HTTPS well-known, strongest), `dnssec` (DNS TXT + DNSSEC), `dns` (plain DNS, weakest).
- **Record format:** semicolon-separated `match;delivery;age-key` — used in both DNS TXT records and `.well-known/age` files.
- **Integration tests** use `//go:build integration` and env vars like `INTEGRATION_SMTP_HOST`. They are excluded from normal `go test` runs.
- **Keep docs in sync.** When adding/removing features or changing behavior, update these files:
  - `README.md` — user-facing docs, setup instructions, usage examples
  - `ARCHITECTURE.md` — component descriptions, threat model, wire format, configuration table
  - `config.example.json` — add/remove config keys to match `internal/config/config.go`
  - `.env.example` — keep environment variable examples current

## MCP Helper

- You have access to Serena's coding tools alongside your built-in tools 