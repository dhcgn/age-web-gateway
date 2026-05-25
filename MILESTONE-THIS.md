# This Milestone Plan

## 1. PQ Recipient Icon
**What:** Show a distinct icon in the UI for post-quantum age keys.  
**How:** After lookup, check if the resolved key starts with `age1pq1` (PQ) vs `age1` (classical X25519). Render a different icon/badge next to the recipient input.  
**Where:** Frontend lookup result display component.

---

## 2. Warn When Delivery Address Differs From Recipient
**What:** After lookup, if `Record.Delivery` differs from the queried recipient address, show a visible warning in the UI.  
**Why:** The hoster's age record can route mail to a different mailbox than the address the user typed. The user should know their message will be delivered to a different email address.  
**Example warning:** "Note: this message will be delivered to `delivery@example.com`, not `recipient@example.com`."  
**Where:** `internal/lookup/record.go` already stores `Delivery`; it just needs to be exposed in the `/api/lookup` JSON response and shown in the frontend.

---

## 3. Attachment Size Warning (>10 MB)
**What:** Show a warning when the total attachment + message size exceeds 10 MB.  
**How:** Add a client-side byte-count check on the total MIME size (message + all attachments). Show a warning — not a hard block — if the total exceeds 10 MB, so the user can reduce attachment size before sending.

---

## 4. Privacy Notice: Recipient Visibility
**What:** Add a clearly visible, one-time-dismissible notice in the UI explaining the trust model.  
**Content must cover:**
- The recipient's email address is visible to the server operator (needed for delivery).
- The message content and sender identity are NOT visible to the server operator (end-to-end encrypted).
- Rationale: the sender's browser must call this server to resolve the age key and deliver the ciphertext. The operator can see who you are sending to, but not what you send.

---

## 5. ~~Multiple Recipients — Key Visibility Warning~~ — Resolved by Item 7
Per-recipient encryption (item 7) is implemented in this milestone, so no interim block or warning is needed. Key cross-visibility is structurally eliminated because each recipient receives their own independently encrypted message.

---

## 6. Non-Encrypted Context Field (Subject / Greeting)
**What:** Add an optional plaintext text field to the send form, transmitted outside the encrypted payload.  
**Behavior:**
- The field is optional. If left empty, nothing is added.
- The value is included in the MIME message as a standard `Subject:` header or a separate plaintext MIME part — not encrypted.
- A persistent inline warning is shown next to the field: "This field is not encrypted. Anyone with access to this email can read it. Do not put sensitive information here."
- The field can be pre-filled via a URL query parameter (e.g., `?subject=Hello`).
**Backend:** `mail/mime.go` needs a `Subject` or `Context` string added to the `Payload` struct.

---

## 7. Per-Recipient Encryption and Sending
**What:** When sending to multiple recipients, encrypt and transmit the message separately for each recipient — one age-encrypted blob per recipient, one PoW challenge per recipient.  
**Why:** Prevents key cross-visibility and aligns PoW spam protection with per-recipient cost.  
**Behavior:**
- The UI shows a progress indicator: "Sending to recipient 1 of N…" while each PoW is solved and each POST is made.
- If sending to one recipient fails, the UI shows which succeeded and which failed, rather than failing the whole batch.
- Each send is an independent `/api/send` call with a fresh PoW token.
**Note:** Implement this alongside item 6 (context field), since both touch the send payload and the MIME assembly.

---

## 8. Multiple Key Matches for One Recipient — Strongest Wins
**What:** When a recipient's age record returns multiple matching keys (e.g., both a domain-level and a user-level match), the system must pick exactly one and tell the user.  
**Selection rule:** Use the match with the highest trust level: `https` > `dnssec` > `dns`. If two matches have equal trust, prefer the more specific one (`user@domain` over `domain`).  
**UI behavior:** Show a dismissible warning: "Multiple keys were found for this recipient. The most trusted key was selected automatically."  
**Where:** `internal/lookup/lookup.go` — the lookup service already resolves records; add a `SelectedKey` field to `Result` with a `SelectionReason` string.
