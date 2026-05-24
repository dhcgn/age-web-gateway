# Architecture

> **Status:** Draft v0.1 — living document, expect churn.
> **Working name:** _agemail_ (placeholder, change freely).

A self-hostable service that lets anyone send **end-to-end encrypted** text and
files to a recipient identified by a DNS/HTTPS-published [age](https://age-encryption.org)
public key. Encryption happens entirely in the recipient's-key-aware **browser
client**; the **Go backend** only discovers keys, accepts an opaque encrypted
blob guarded by a proof-of-work, and relays it over SMTP.

The whole thing ships as **one Go binary / one Docker image** that serves both
the static frontend and the backend API.

---

## 1. Goals & Non-Goals

### Goals
- Encrypt message body + arbitrary files in the browser with age, including
  **hybrid post-quantum** recipients (`age1pq1…`).
- Discover a recipient's public key from **their own domain** (DNS or HTTPS),
  with a clear, visible indication of how trustworthy that discovery was.
- Never let plaintext (body, filenames, file contents) leave the browser.
- Spam-resistance via client-side **proof of work** bound to content + time.
- Trivial self-hosting: single binary, single image, no external runtime deps.
- **Zero external runtime references** — all JS/CSS/wasm is served by the binary
  itself (no CDN, no third-party origins).

### Non-Goals (for now)
- We are **not** a mailbox / IMAP / key-management service. We send, we don't store.
- We do **not** manage recipients' private keys. Recipients decrypt with their
  own age tooling.
- We do **not** attempt to hide metadata that SMTP inherently exposes (recipient
  address, approximate timing, message size).

---

## 2. Threat Model

This section is deliberately blunt; it defines what the system does and does
**not** protect against.

### 2.1 What we protect
- **Confidentiality of content against the mail path.** Body, filenames, and
  file bytes are age-encrypted in the browser to the recipient's public key(s).
  SMTP servers, the relay, and intermediaries see only ciphertext.
- **Confidentiality against our own backend.** The backend receives only the
  already-encrypted blobs + recipient address + PoW. It cannot read content.
- **Post-quantum confidentiality** when a hybrid recipient key is used
  (X25519 + ML-KEM), protecting against "harvest now, decrypt later".

### 2.2 What we do NOT (and cannot) protect — read carefully
- **Server-delivered-code trust.** The browser executes JavaScript that *this
  server* delivers. A compromised or malicious operator can ship backdoored JS
  that exfiltrates plaintext. This is the fundamental limit of all "crypto in
  server-served web code." Bundling everything locally (no CDN) removes the
  *third-party* supply-chain risk but **not** the operator-trust risk.
  Mitigations we plan (see §9): reproducible builds, signed releases, optional
  pinned/offline client. **This must be communicated honestly to users.**
- **Plain-DNS key authenticity.** A DNS TXT record without DNSSEC is forgeable
  by an on-path attacker, who could substitute their own public key. We do not
  silently trust it — we *label* its trust level (see §4).
- **Address-enumeration via DNS.** If per-user keys are published as plain
  records under one `_age.<domain>` node, anyone can enumerate all addresses.
  See open question OQ-2.
- **Traffic analysis / metadata.** Recipient, timing, and size are visible to
  the mail infrastructure.
- **Endpoint compromise.** A malicious browser extension or compromised device
  defeats E2E. Out of scope.

### 2.3 Trust boundaries
```
[ User's browser ]  --(1) key lookup query-->  [ Backend ]  --(DNS/HTTPS)--> [ Recipient's domain ]
       |                                            |
       | (plaintext NEVER crosses this line)        |
       v                                            v
  age-encrypt locally                         relay only (cannot decrypt)
       |                                            |
       +----(2) {ciphertext blobs, recipients, PoW}-+--(SMTP)--> [ Recipient's MX ]
```

---

## 3. Components

| Component | Tech | Responsibility |
|---|---|---|
| **Frontend** | Static HTML/CSS + TypeScript, [typage](https://github.com/FiloSottile/typage) (`age-encryption`) | UI, key lookup calls, age encryption, PoW computation. Served as static assets embedded in the binary. |
| **Backend API** | Go (net/http) | Key discovery (DNS + HTTPS well-known), PoW verification, mail relay (SMTP or Cloudflare Email API), static asset serving. |
| **Packaging** | `embed.FS` + Docker | One binary embeds the built frontend; one image runs it. |

There is intentionally **no database**. The only state is an in-memory,
short-TTL PoW replay cache (§7).

---

## 4. Key Discovery

A recipient is given either as a **bare domain** (`domain.de`) or a
**fully-qualified address** (`user@domain.de`). Both are supported.

Discovery is performed **by the backend** (browsers can't do raw DNS), via an
endpoint the client calls per recipient. The backend returns the recipient's
age public key(s) **and the trust level** by which they were obtained.

### 4.1 Discovery methods & trust levels (visually distinct in UI)

| Method | How | Trust level | UI treatment |
|---|---|---|---|
| **HTTPS well-known** | `GET https://<domain>/.well-known/age` | Authenticated by Web PKI/TLS | 🟢 lock icon — "verified via HTTPS" |
| **DNS TXT + DNSSEC** | TXT at `_age.<domain>`, validated chain (AD bit from a validating resolver) | Authenticated by DNSSEC | 🟢 shield icon — "verified via DNSSEC" |
| **DNS TXT, no DNSSEC** | TXT at `_age.<domain>`, not validated | **Unauthenticated / spoofable** | 🟡 amber warning — "found, but not verified" |

The client must surface the *worst* trust level among all selected recipients
before allowing send, and label each recipient individually.

### 4.2 Why HTTPS well-known matters for PQ
Hybrid PQ recipients are **~2000 characters long**. That is impractical for DNS
TXT (255-byte string chunks, large responses forcing TCP, resolver limits).
HTTPS `.well-known` has no such limit and is TLS-authenticated without requiring
the recipient to deploy DNSSEC. **Recommended default for PQ keys.**

### 4.3 Record / file format

Each entry has a consistent **3-field, semicolon-separated** schema:
```
<match> ; <delivery> ; <age-key>
```
- **`match`** — the identity the *sender* addresses: a bare domain `domain.de`
  or a full address `user@domain.de`.
- **`delivery`** — the real mailbox the encrypted mail is actually relayed to
  (RCPT TO). **Optional**: if empty, deliver to `match` itself (only valid when
  `match` is a full address). For a bare-domain line, `delivery` is the
  domain-wide catch-all mailbox.
- **`age-key`** — the recipient's age public key (classic `age1…` or hybrid
  PQ `age1pq1…`).

**Resolution & catch-all:** look up the exact `user@domain.de` line first; if
none exists, fall back to the `domain.de` default line — which therefore *is*
the catch-all. No separate per-line catch-all column is needed.

**DNS TXT** at `_age.<domain>`, one record per entry:
```
domain.de;catchall_age@domain.de;age1a3xsw5j5d27k4zmp5wzr7kp49m7gvgt87f32gq3he7da0r4jne6qyk4mmy
```

**HTTPS well-known** at `https://<domain>/.well-known/age` — same line grammar,
comments allowed:
```
# domain default = catch-all (bare-domain sends + unlisted users)
domain.de;catchall_age@domain.de;age1a3xsw5j5d27k4zmp5wzr7kp49m7gvgt87f32gq3he7da0r4jne6qyk4mmy
# user, deliver to the address itself (delivery field empty)
user@domain.de;;age1a3xsw5j5d27k4zmp5wzr7kp49m7gvgt87f32gq3he7da0r4jne6qyk4mmy
# user with a different delivery mailbox
user1@domain.de;age@domain.de;age1a3xsw5j5d27k4zmp5wzr7kp49m7gvgt87f32gq3he7da0r4jne6qyk4mmy
# post-quantum key (HTTPS only — too long for DNS TXT)
domain.de;catchall_age@domain.de;age1pq1lzz...   (≈2000 chars)
```

Multiple keys per `match` are allowed (rotation, multiple devices, classic +
PQ): repeat the line with a different key. When several exist, the client
encrypts to **all** of them so any of the recipient's keys can decrypt.
(OQ-1: confirm "encrypt to all" vs "prefer PQ".)

> **Privacy caveat (extends OQ-2).** Listing per-user lines *and* delivery
> mailboxes in a public well-known file (or under one DNS node) lets anyone
> fetch it and **enumerate all users plus your internal routing mailboxes**
> (`catchall_age@`, `age@`). If enumeration matters, do **not** serve a full
> listing — use per-user lookup (path- or hash-based, §OQ-3) that reveals only
> the queried identity.

### 4.4 Lookup API (backend → client)
Like all `/api/*` endpoints, this requires a valid PoW token (§7), passed e.g.
as an `X-PoW: <ts>.<nonce>` header.
```
GET /api/lookup?recipient=user@domain.de
200 OK
{
  "recipient": "user@domain.de",
  "found": true,
  "trust": "https" | "dnssec" | "dns",
  "recipients": ["age1...", "age1pq1..."]
}
```
`found:false` → red ✗, cannot send to that recipient.

---

## 5. Client Workflow

**Every** call to the backend is gated by a fresh proof-of-work token (§7),
including key lookups. The frontend shows a **progress bar** while solving the
PoW. With the small dev/test difficulty this is near-instant; in production it
costs a few seconds.

1. User types one or more recipients. Each lookup solves a PoW, then calls
   `/api/lookup` → ✓/✗ + trust badge. (Debounce input so we don't burn a PoW per
   keystroke.)
2. User types body text and drops files.
3. On **Send** (all recipients must be ✓):
   1. Build **`message.age`** = age-encrypted body text.
   2. For each file *NNN* (zero-padded, starting `001`):
      - **`attachment-NNN.payload.age`** = age-encrypted file bytes.
      - **`attachment-NNN.meta.age`** = age-encrypted JSON
        `{ "filename": "...", "mime": "...", "size": 12345, "sha256": "..." }`.
      All parts are encrypted to the union of all recipients' keys.
   3. Solve a **proof of work** over `(timestamp, nonce)` (§7) — progress bar.
   4. POST the bundle + PoW token to `/api/send`.

Encryption uses typage:
- classic recipients via `Encrypter.addRecipient("age1…")`,
- hybrid PQ recipients are accepted by the same API (no plugin binary needed),
- typage is **bundled locally**, not loaded from a CDN.

### 5.1 Deep-link prefill (URL fragment)

The page accepts a **URL fragment** to pre-fill recipients and body, e.g.:
```
https://service.example/#to=user@domain.de,ops@example.org&body=Hello%20there
```
Supported keys: `to` (comma-separated recipients), `body` (URL-encoded).

**Why the fragment (`#`) and not a query (`?`):** the fragment is **never sent
to the server** — browsers keep it client-side. Recipients and body therefore
**never reach backend logs**. A `?body=` query would leak that plaintext into
every access log. Using `#` is the privacy-correct choice.

Caveats (documented for users): the prefilled body is plaintext in a shareable
link and lands in browser history — it is for **convenience only**, not for
transmitting secrets. The secret is whatever the user encrypts after landing on
the page. The client parses the fragment, populates the fields (triggering the
normal per-recipient lookup), and should `history.replaceState` to drop the
fragment from the visible URL once consumed.

---

## 6. Wire Format (client → `/api/send`)

`POST /api/send`, `Content-Type: multipart/form-data` (or JSON+base64 — OQ-4):
```
recipients   = ["user@domain.de", "ops@example.org"]
pow          = "<ts>.<nonce>"          // single-use token, see §7
message      = <bytes of message.age>
attachments  = [
  { payload: <attachment-001.payload.age>, meta: <attachment-001.meta.age> },
  ...
]
```
The server treats every `*.age` blob as **opaque**. It never parses ciphertext.

---

## 7. Proof of Work

A **generic middleware** gates every `/api/*` request. One solved PoW = one
single-use token worth one accepted call. Goal: make each call cost client CPU
and prevent replay; this is enough for anti-spam.

Deliberately **simple**: the PoW is *not* bound to request content. Because the
server consumes each token exactly once (replay cache) and the transport is TLS
(integrity-protected), content-binding would add no anti-spam value — see §7.4.

### 7.1 Construction (client)
```
ts    = current unix time (seconds)
find nonce such that:
    SHA-256( ts ‖ nonce )  has >= DIFFICULTY leading zero bits
token = "<ts>.<nonce>"
```

### 7.2 Verification (server)
A token is accepted iff **all** hold:
- `|now - ts| <= VALIDITY` (default **60 s**), accounting for small clock skew.
- Leading-zero-bits requirement met for the configured `DIFFICULTY`.
- `(ts, nonce)` is **not** already in the replay cache; on acceptance it is added.

`ts` differs (or the found `nonce` differs) on every solve, so each token is
naturally unique.

### 7.3 Replay cache
- In-memory set of seen `(ts, nonce)`.
- **TTL = 120 s** (2× validity): always covers the 60 s validity window plus
  skew; older entries are evicted and would fail the freshness check anyway.

`DIFFICULTY` and `VALIDITY` are configurable (§8). Difficulty is set **low for
debugging/testing** (even 0–4 bits) and higher in production.

### 7.4 Caveats (honest limits of the simplification)
- **Restart loses the cache.** The replay cache is in-memory; after a backend
  restart a captured token could be replayed within its ≤60 s window. Acceptable
  for a single-binary self-hosted service over TLS. (Persisting the cache is an
  option if needed — OQ-8.)
- **Horizontal scaling needs a shared cache.** With multiple backend instances,
  the replay cache must be shared (e.g. Redis); otherwise a token is usable once
  *per instance*. Single-instance is the assumed default.
- Content-binding would only defend against an on-path attacker swapping the
  payload while keeping a valid token — which TLS already prevents. If the
  threat model ever drops TLS, reintroduce a content hash in the preimage.

---

## 8. Backend Responsibilities & Configuration

### Responsibilities
0. **PoW middleware** in front of all `/api/*` endpoints: verify the single-use
   token (§7) before any work is done.
1. Serve embedded static frontend.
2. `/api/lookup` — DNS TXT (with DNSSEC validation when available) + HTTPS
   well-known fetch; report trust level.
3. `/api/send` — for each addressed identity, re-resolve the record (§4.3) to
   obtain the **delivery mailbox**, then deliver via the configured **mail
   backend** (selected by `MAIL_BACKEND`):
   - **`smtp`** (default): assemble a `multipart/mixed` MIME message and relay
     via STARTTLS SMTP. The server owns the envelope headers (From, Date,
     Message-ID, optional **DKIM** signing).
   - **`cloudflare`**: POST a JSON payload to the
     [Cloudflare Email REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).
     `message.age` and each attachment pair are sent as base64-encoded
     `attachments` entries; no local MIME assembly is required.

   In both cases the `.age` blobs are **opaque** to the backend — it never
   parses ciphertext. Subject: "You have received an encrypted message".
   Body (plaintext): short notice about age decryption.
4. `/healthz` — liveness/readiness. (The trailing `z` is just the Google/
   Kubernetes z-pages convention to avoid clashing with app routes; `/health`
   works identically — rename if preferred.)

### Configuration (env vars; file optional)
| Key | Purpose |
|---|---|
| `LISTEN_ADDR` | e.g. `:8080` |
| `MAIL_BACKEND` | `smtp` (default) or `cloudflare` — selects the delivery backend |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP relay config (used when `MAIL_BACKEND=smtp`) |
| `CF_ACCOUNT_ID` / `CF_API_TOKEN` / `CF_FROM` | Cloudflare Email API credentials (used when `MAIL_BACKEND=cloudflare`) |
| `POW_DIFFICULTY` | leading zero bits |
| `POW_VALIDITY_SECONDS` | default 60 |
| `DNS_RESOLVER` | optional validating resolver for DNSSEC |
| `WELLKNOWN_TIMEOUT` | HTTPS lookup timeout |
| `DKIM_*` | optional signing key/selector/domain (SMTP only) |

TLS is expected to terminate at a **reverse proxy** (caddy/nginx/traefik);
built-in TLS optional later. (OQ-5)

---

## 9. Deployment & Supply Chain

- **Single binary**: frontend built (TS → bundled JS/CSS) and embedded via
  `embed.FS`. No external origins at runtime; a strict **CSP** forbids any
  non-self origin (`default-src 'self'`).
- **Single image**: multi-stage Dockerfile (node build stage → go build stage →
  distroless/scratch runtime).
- **Integrity story** (mitigating the operator-trust caveat in §2.2):
  reproducible builds, Sigstore-attested releases, and a documented way to run a
  pinned/offline copy of the client. (OQ-6)

---

## 10. Proposed Project Layout
```
/cmd/agemail/            main.go (wires everything, embed.FS)
/internal/lookup/        DNS TXT + DNSSEC + well-known discovery, trust levels
/internal/pow/           verification + replay cache
/internal/mail/          MIME assembly, Sender interface, SMTP relay, Cloudflare Email API, optional DKIM
/internal/api/           HTTP handlers (/api/lookup, /api/send, /healthz)
/web/                    TypeScript client (typage), built into /web/dist
/web/dist/               embedded static output
/deploy/Dockerfile
/config.integration.yaml (gitignored — see §11)
architecture.md
```

---

## 11. Testing

- **Unit**: PoW verify (difficulty, freshness, replay), lookup parsing, MIME
  assembly. No network.
- **Integration** (build tag `//go:build integration`): real SMTP relay test
  using an **optional, uncommitted** config file
  (`config.integration.yaml`, in `.gitignore`). Tests **skip** automatically if
  the file/env is absent, so CI without secrets stays green.
- **Frontend**: encrypt-then-decrypt round-trip with a known age identity;
  verify classic and hybrid-PQ recipients both produce decryptable output.

---

## 12. Open Questions

- **OQ-1**: When multiple keys exist for a recipient — encrypt to *all*, or
  prefer PQ when present? (Default proposed: all.)
- **OQ-2**: Address-enumeration protection for per-user DNS keys — adopt hashed
  local-part subdomains (OPENPGPKEY-style) or accept enumeration?
- **OQ-3**: Exact well-known path & shape — single `/.well-known/age` recipients
  file for the whole domain, or per-user (`/.well-known/age/<localpart>` vs
  query param, which leaks the localpart into server logs)?
- **OQ-4**: `/api/send` body — multipart vs JSON+base64.
- **OQ-5**: Built-in TLS vs reverse-proxy-only.
- **OQ-6**: How far to go on the integrity story (SRI-of-self, reproducible
  build pipeline, signed release verification UX).
- **OQ-7**: DKIM signing in scope for v1, or rely on the relay's own signing?
- **OQ-8**: Persist the PoW replay cache across restarts / share it across
  instances, or accept the in-memory single-instance limitation (§7.4)?