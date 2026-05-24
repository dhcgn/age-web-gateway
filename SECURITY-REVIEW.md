# Security Review — Proof-of-Work System

**Date:** 2026-05-24
**Scope:** `internal/pow/`, `internal/api/middleware.go`, `web/src/pow.ts`, configuration & deployment model
**Reviewer:** Copilot security analysis

---

## Summary

The PoW system is the **sole anti-abuse mechanism** protecting `/api/send` and `/api/lookup`. This review found **1 critical, 2 high, 4 medium, and 2 low** severity issues. The most impactful finding is that the default difficulty (4 bits) provides essentially no rate-limiting protection.

---

## Findings

### 🟣 CRITICAL

#### 1. Default difficulty=4 provides no meaningful rate limit
- **File:** `internal/pow/pow.go`, `internal/config/config.go` (default: 4)
- **Impact:** Solving requires ~16 SHA-256 hashes on average. A single CPU core can mint thousands of valid tokens per second. GPUs or rented compute can trivially outpace any server. This makes the PoW gate meaningless against automated abuse.
- **Recommendation:** Raise difficulty to at least 20–24 bits for meaningful protection (~1s browser solve time on commodity hardware). Consider dynamic difficulty based on server load. Add conventional IP rate limits as a complementary layer.

---

### 🔴 HIGH

#### 2. PoW cost is not bound to request cost (amplification)
- **File:** `internal/api/middleware.go`, send/lookup handlers
- **Impact:** One cheap PoW token (difficulty=4) can authorize an expensive `/api/send` request with many recipients, large body, and multiple outbound emails + DNS lookups. This creates an amplification vector where attacker cost is negligible but server/provider cost is high.
- **Recommendation:**
  - Enforce `http.MaxBytesReader` on request bodies
  - Limit max recipients per request
  - Limit attachment count/size
  - Consider per-recipient PoW difficulty scaling or per-endpoint difficulty

#### 3. Replay cache is unbounded — memory DoS vector
- **File:** `internal/pow/pow.go` — `ReplayCache`
- **Impact:** The `seen` map grows without bounds. Valid tokens include arbitrary-length nonces stored as map keys. With low difficulty, an attacker can cheaply generate millions of valid tokens with large nonces, forcing unbounded memory growth until OOM.
- **Recommendation:**
  - Enforce max token length (e.g., 128 bytes) before processing
  - Validate nonce is decimal digits only with a max length (e.g., 32 digits)
  - Add a max cache size with backpressure (reject new tokens when cache is full)
  - Consider a bounded data structure (e.g., bloom filter for approximate replay detection)

---

### 🟠 MEDIUM

#### 4. Future timestamps accepted symmetrically
- **File:** `internal/pow/pow.go:89-95`
- **Impact:** Freshness check uses `abs(now - ts) <= validity`, accepting tokens up to 60s in the future. This doubles the effective precomputation window and allows attackers to continuously stockpile valid tokens before using them.
- **Recommendation:** Use asymmetric window: `ts <= now + smallSkew && ts >= now - validity`, where `smallSkew` is 5–10 seconds to handle clock drift.

#### 5. Preimage construction is ambiguous
- **File:** `internal/pow/pow.go:98` — `fmt.Sprintf("%s%s", parts[0], parts[1])`
- **Impact:** `SHA-256("12" + "34")` equals `SHA-256("1" + "234")` since both produce `"1234"`. Token `12.34` and `1.234` hash identically. While current 10-digit Unix timestamps make collision unlikely in practice, this is an avoidable design flaw that weakens canonicalization guarantees.
- **Recommendation:** Include the delimiter in the preimage: `SHA-256(ts + "." + nonce)`, matching the token format. Also enforce strict parsing (digits-only, no leading zeros in nonce).

#### 6. In-memory replay cache fails in multi-instance deployments
- **File:** `internal/pow/pow.go` — `ReplayCache`
- **Impact:** Each process maintains its own cache. Behind a load balancer, the same token can be replayed once per instance. Server restarts also clear all replay state, allowing previously-used tokens (within validity) to be reused.
- **Recommendation:** Document single-instance limitation clearly. For multi-instance deployments, use a shared store (Redis `SETNX` with TTL, or similar). Alternatively, use server-issued challenges with HMAC to make replay protection stateless.

#### 7. No input validation on nonce format/length
- **File:** `internal/pow/pow.go:78-81`
- **Impact:** The nonce portion of the token accepts arbitrary strings (Unicode, special chars, very long strings). This expands attack surface for cache memory exhaustion and makes client/server token semantics inconsistent.
- **Recommendation:** Validate token format with strict pattern: `^[0-9]{10}\.[0-9]{1,32}$` before any further processing.

---

### 🔵 LOW

#### 8. No configuration validation at startup
- **File:** `internal/config/config.go`
- **Impact:** `difficulty=0` makes all hashes valid (disables PoW). Negative validity can cause panics or unexpected ticker behavior. `difficulty > 256` makes solving impossible.
- **Recommendation:** Validate at startup:
  - `1 <= difficulty <= 256`
  - `validity > 0` and within a reasonable range
  - Log a warning if difficulty < recommended minimum

#### 9. Token is not bound to endpoint or request context
- **File:** `internal/pow/pow.go`, `internal/api/middleware.go`
- **Impact:** A solved token is a generic coupon usable for any protected endpoint. If a token leaks (logs, proxies, browser extensions), it can be used for unintended operations. Lookup tokens (cheap operation) could be used for send (expensive operation).
- **Recommendation:** Include operation context in the preimage (e.g., method + path), or use different difficulty levels per endpoint (higher for `/api/send`).

---

## Architectural Recommendations

### Server-issued challenges (long-term)
The current design is fully offline — attackers can mint tokens without any server interaction. A stronger model:
1. Client requests a challenge from the server
2. Server returns a signed challenge (HMAC) with timestamp, operation, and difficulty
3. Client solves `SHA-256(challenge || nonce)`
4. Server verifies HMAC, freshness, difficulty, and replay

This prevents timestamp manipulation, enables per-request difficulty, and makes precomputation infeasible.

### Layered abuse controls
PoW should not be the sole defense. Consider adding:
- IP/subnet rate limits (e.g., X requests per minute per IP)
- Per-domain recipient throttles
- Outbound email quotas
- Request body size limits (`http.MaxBytesReader`)
- DNS lookup concurrency limits
- SMTP/provider error backoff

---

## Risk Matrix

| # | Severity | Issue | Exploitability |
|---|----------|-------|----------------|
| 1 | 🟣 CRITICAL | Difficulty=4 ≈ no protection | Trivial |
| 2 | 🔴 HIGH | No cost binding / amplification | High |
| 3 | 🔴 HIGH | Unbounded replay cache | High |
| 4 | 🟠 MEDIUM | Future timestamps accepted | Moderate |
| 5 | 🟠 MEDIUM | Ambiguous preimage | Low (theoretical) |
| 6 | 🟠 MEDIUM | Single-instance replay cache | Deployment-dependent |
| 7 | 🟠 MEDIUM | No nonce validation | Moderate |
| 8 | 🔵 LOW | No config validation | Misconfiguration |
| 9 | 🔵 LOW | Token not endpoint-bound | Low |
