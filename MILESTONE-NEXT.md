# Next Milestone Plan

## 1. CLI Tool: Read & Decrypt Encrypted Mails
Create a script/CLI tool that searches for age-encrypted mails and decrypts them via age, making the full workflow more convenient to use.

---

## 2. Multi-Language Support
Add i18n support, starting with English and German.

---

## 3. Research: Alternative Mail Format for Attachments
Investigate whether the message and attachments can be sent in a combined format that standard mail clients (Outlook, Thunderbird, Apple Mail) can open natively, rather than the current `.age` file approach.

---

## 4. Tor Support
Make the web UI usable over Tor. Requirements:
- Only JavaScript must be enabled (encryption happens in the browser — no JS = no encryption).
- Add a visible `<noscript>` notice explaining why JS is required and that the page cannot function without it.

---

## 5. Minisign Key Support
Add a mode to attach a minisign key to sign the outgoing package.

---

## 6. Desktop App (Wails)
Build a desktop application using Wails, wrapping the existing web UI.

---

## 7. PoW System Review
Audit the proof-of-work configuration and replay-cache behavior. Questions to answer:
- Is the default difficulty (16 bits) and mailsend difficulty (20 bits) appropriate for the expected client hardware?
- Is the in-memory replay cache sufficient, or does it need persistence across restarts?
- Should the validity window (currently 60s, see `config.go`) be configurable per endpoint?
- Does the client solver need a progress indicator for high-difficulty challenges?

---

## 8. Reduced Embed Form (HTML Fragment)
A minimal, embeddable form with only a text input (optionally file attachments) and an optional greeting/subject line. Designed for embedding in other pages (e.g., via `<iframe>` or server-side include).  
**Behavior:**
- The recipient is pre-configured via a URL query parameter (e.g., `?to=alice@example.com`), not typed by the user.
- No full-page UI chrome — just the input fields and send button.
- Attachments are optional; the embed can be configured to hide the attachment input entirely via a URL flag (e.g., `?attachments=0`).

---

## 9. Cloudflare Attachment Size — In-Depth Analysis
Research the exact Cloudflare Email Workers message size limit (check current docs — the limit may change) and evaluate whether the 10 MB warning threshold (implemented in the current milestone) needs to be adjusted per backend. Document the SMTP limit (typically 25 MB) vs Cloudflare limit differences and whether per-backend thresholds should be configurable.
