import {
  lookupRecipient,
  removeRecipient,
  getResolvedRecipients,
  isAllResolved,
  getWorstTrust,
  setUpdateCallback,
  trustIcon,
  trustLabel,
  clearRecipients,
  isPQKey,
} from "./recipients";
import { solvePoW, getDifficulty } from "./pow";
import { sendMessage, SendProgress, RecipientSendResult } from "./send";
import { applyDeepLink } from "./deeplink";

const POW_PROGRESS_START = 15;
const POW_PROGRESS_END = 78;

function powBarPercent(completionProbability: number): number {
  const clamped = Math.max(0, Math.min(0.99, completionProbability));
  return POW_PROGRESS_START + clamped * (POW_PROGRESS_END - POW_PROGRESS_START);
}

// --- DOM elements ---
const recipientsInput = document.getElementById("recipients-input") as HTMLInputElement;
const recipientsList = document.getElementById("recipients-list") as HTMLDivElement;
const recipientsError = document.getElementById("recipients-error") as HTMLDivElement;
const trustWarning = document.getElementById("trust-warning") as HTMLDivElement;
const trustWarningText = document.getElementById("trust-warning-text") as HTMLSpanElement;
const bodyInput = document.getElementById("body-input") as HTMLTextAreaElement;
const subjectInput = document.getElementById("subject-input") as HTMLInputElement;
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const progressSection = document.getElementById("progress-section") as HTMLDivElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
const progressText = document.getElementById("progress-text") as HTMLSpanElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const sizeWarning = document.getElementById("size-warning") as HTMLDivElement;
const sizeWarningText = document.getElementById("size-warning-text") as HTMLSpanElement;
const recentRecipientsBox = document.getElementById("recent-recipients") as HTMLDivElement;
const recentRecipientsListEl = document.getElementById("recent-recipients-list") as HTMLDivElement;
const recentRecipientsClearBtn = document.getElementById("recent-recipients-clear") as HTMLButtonElement;

const RECENT_RECIPIENTS_STORAGE_KEY = "agemail.recent-recipients";
const RECENT_RECIPIENTS_MAX = 15;

function loadRecentRecipients(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_RECIPIENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function saveRecentRecipients(list: string[]): void {
  try {
    localStorage.setItem(RECENT_RECIPIENTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore (private mode / quota)
  }
}

function rememberRecipient(address: string): void {
  const norm = address.trim();
  if (!norm) return;
  const list = loadRecentRecipients().filter((a) => a.toLowerCase() !== norm.toLowerCase());
  list.unshift(norm);
  if (list.length > RECENT_RECIPIENTS_MAX) list.length = RECENT_RECIPIENTS_MAX;
  saveRecentRecipients(list);
  renderRecentRecipients();
}

function forgetRecipient(address: string): void {
  const norm = address.trim().toLowerCase();
  const list = loadRecentRecipients().filter((a) => a.toLowerCase() !== norm);
  saveRecentRecipients(list);
  renderRecentRecipients();
}

function forgetAllRecipients(): void {
  saveRecentRecipients([]);
  renderRecentRecipients();
}

recentRecipientsClearBtn.addEventListener("click", () => {
  if (loadRecentRecipients().length === 0) return;
  if (confirm("Remove all recent recipients?")) {
    forgetAllRecipients();
  }
});

function renderRecentRecipients(): void {
  const list = loadRecentRecipients();
  recentRecipientsListEl.innerHTML = "";

  if (list.length === 0) {
    recentRecipientsBox.hidden = true;
    return;
  }
  recentRecipientsBox.hidden = false;

  for (const address of list) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recent-chip";
    chip.dataset.address = address;
    chip.title = `Click to add ${address}`;

    const label = document.createElement("span");
    label.className = "recent-chip-label";
    label.textContent = address;
    chip.appendChild(label);

    const removeSpan = document.createElement("span");
    removeSpan.className = "recent-chip-remove";
    removeSpan.textContent = "×";
    removeSpan.title = "Remove from recent list";
    removeSpan.setAttribute("role", "button");
    removeSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      forgetRecipient(address);
    });
    chip.appendChild(removeSpan);

    chip.disabled = pendingAddresses.has(address);
    chip.addEventListener("click", () => {
      if (pendingAddresses.has(address)) return;
      addRecipientBadge(address);
      updateUI();
    });

    recentRecipientsListEl.appendChild(chip);
  }
}

const SIZE_WARN_BYTES = 10 * 1024 * 1024;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function updateSizeWarning(): void {
  const bodyBytes = new TextEncoder().encode(bodyInput.value).length;
  let total = bodyBytes;
  for (const f of files) {
    total += f.size;
  }
  if (total > SIZE_WARN_BYTES) {
    sizeWarningText.textContent =
      `Total size ${formatMB(total)} exceeds the ${formatMB(SIZE_WARN_BYTES)} guideline. ` +
      `Large messages may be rejected by mail relays or Cloudflare. You can still send.`;
    sizeWarning.hidden = false;
  } else {
    sizeWarning.hidden = true;
  }
}
const statusDiv = document.getElementById("status") as HTMLDivElement;
const copyUrlLink = document.getElementById("copy-url-link") as HTMLAnchorElement;

const debugSection = document.getElementById("debug-section") as HTMLDivElement | null;
const debugDifficultyInput = document.getElementById("debug-difficulty-input") as HTMLInputElement | null;
const debugApplyDifficultyBtn = document.getElementById("debug-apply-difficulty") as HTMLButtonElement | null;
const debugCurrentDifficulty = document.getElementById("debug-current-difficulty") as HTMLSpanElement | null;
const debugTestPowBtn = document.getElementById("debug-test-pow") as HTMLButtonElement | null;
const debugPowResult = document.getElementById("debug-pow-result") as HTMLPreElement | null;

// --- State ---
const pendingAddresses = new Set<string>();
const files: File[] = [];

function parseRecipientTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getLinkRecipients(): string[] {
  const values = new Set<string>(pendingAddresses);
  for (const token of parseRecipientTokens(recipientsInput.value)) {
    values.add(token);
  }
  return Array.from(values);
}

function setCopyUrlLinkEnabled(enabled: boolean): void {
  copyUrlLink.hidden = false;
  copyUrlLink.classList.toggle("disabled", !enabled);
  copyUrlLink.setAttribute("aria-disabled", String(!enabled));
  copyUrlLink.tabIndex = enabled ? 0 : -1;
  if (enabled) {
    copyUrlLink.setAttribute("href", "#");
  } else {
    copyUrlLink.removeAttribute("href");
  }
}

function commitRecipientsFromInput(): void {
  const addresses = parseRecipientTokens(recipientsInput.value);

  if (addresses.length === 0) {
    return;
  }

  for (const address of addresses) {
    addRecipientBadge(address);
  }
  recipientsInput.value = "";
}

function isLocalhost(): boolean {
  return (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1" ||
    location.hostname === "[::1]"
  );
}

function setDifficultyMeta(value: number): void {
  const meta = document.querySelector('meta[name="pow-difficulty"]') as HTMLMetaElement | null;
  if (meta) {
    meta.content = String(value);
  }
}

function syncDebugDifficulty(): void {
  if (!debugCurrentDifficulty || !debugDifficultyInput) {
    return;
  }
  const difficulty = getDifficulty();
  debugCurrentDifficulty.textContent = String(difficulty);
  debugDifficultyInput.value = String(difficulty);
}

function initDebugSection(): void {
  if (!debugSection) {
    return;
  }

  if (!isLocalhost()) {
    debugSection.hidden = true;
    return;
  }

  debugSection.hidden = false;
  syncDebugDifficulty();

  debugApplyDifficultyBtn?.addEventListener("click", () => {
    if (!debugDifficultyInput || !debugPowResult) {
      return;
    }
    const parsed = parseInt(debugDifficultyInput.value, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 30) {
      debugPowResult.textContent = "Please enter a PoW difficulty between 0 and 30.";
      return;
    }
    setDifficultyMeta(parsed);
    syncDebugDifficulty();
    debugPowResult.textContent = `PoW difficulty set to ${parsed}.`;
  });

  debugTestPowBtn?.addEventListener("click", async () => {
    if (!debugPowResult || !debugTestPowBtn) {
      return;
    }

    const difficulty = getDifficulty();
    let hashesChecked = 0;
    const started = performance.now();

    debugTestPowBtn.disabled = true;
    debugPowResult.textContent = `Running PoW test at difficulty ${difficulty}...`;

    try {
      const token = await solvePoW(difficulty, (progress) => {
        hashesChecked = progress.hashesChecked;
        debugPowResult.textContent = `Running PoW test at difficulty ${difficulty}...\nTried ${hashesChecked.toLocaleString()} hashes.`;
      });
      const elapsedMs = Math.round(performance.now() - started);
      debugPowResult.textContent =
        `Done.\n` +
        `Difficulty: ${difficulty}\n` +
        `Time: ${elapsedMs} ms\n` +
        `Hashes checked: ${hashesChecked.toLocaleString()}\n` +
        `Token: ${token}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PoW test failed";
      debugPowResult.textContent = `Error: ${msg}`;
    } finally {
      debugTestPowBtn.disabled = false;
    }
  });
}

// formatWarning strips low-level detail from server warnings so the UI
// shows a short, human-readable label rather than a raw record line.
function formatWarning(w: string): string {
  if (w.startsWith("ignored malformed record")) {
    return "ignored malformed record";
  }
  return w;
}

function formatWarnings(warnings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of warnings) {
    const f = formatWarning(w);
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

// --- Recipient badge management ---
function addRecipientBadge(address: string): void {
  if (pendingAddresses.has(address)) return;
  pendingAddresses.add(address);

  const wrapper = document.createElement("span");
  wrapper.className = "recipient-wrapper";
  wrapper.dataset.address = address;

  const badge = document.createElement("span");
  badge.className = "recipient-badge";
  badge.dataset.trust = "loading";

  const label = document.createElement("span");
  label.className = "recipient-label";
  label.textContent = address;
  badge.appendChild(label);

  const pqBadge = document.createElement("span");
  pqBadge.className = "pq-badge";
  pqBadge.title = "Post-quantum age key";
  pqBadge.textContent = "PQ";
  pqBadge.hidden = true;
  badge.appendChild(pqBadge);

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", () => {
    pendingAddresses.delete(address);
    removeRecipient(address);
    wrapper.remove();
    updateUI();
  });
  badge.appendChild(removeBtn);

  const note = document.createElement("span");
  note.className = "recipient-note";
  note.hidden = true;
  wrapper.appendChild(badge);
  wrapper.appendChild(note);
  recipientsList.appendChild(wrapper);

  // Trigger lookup.
  lookupRecipient(address, (status, warnings) => {
    switch (status) {
      case "loading":
        badge.dataset.trust = "loading";
        badge.title = "Looking up…";
        label.textContent = address;
        pqBadge.hidden = true;
        note.hidden = true;
        break;
      case "found": {
        const resolved = getResolvedRecipients().find((r) => r.address === address);
        if (resolved) {
          badge.dataset.trust = resolved.trust;
          badge.title = `${trustIcon(resolved.trust)} ${trustLabel(resolved.trust)}`;
          label.textContent = `${trustIcon(resolved.trust)} ${address}`;
          pqBadge.hidden = !isPQKey(resolved.selectedKey);

          const notes: string[] = [];
          if (resolved.selectionReason === "pq-preferred") {
            notes.push("Multiple keys found; the post-quantum key was selected.");
          }
          if (resolved.delivery && resolved.delivery.toLowerCase() !== address.toLowerCase()) {
            notes.push(`Delivered to ${resolved.delivery}.`);
          }
          for (const w of formatWarnings(resolved.warnings)) {
            notes.push("⚠ " + w);
          }
          if (notes.length > 0) {
            note.textContent = notes.join(" ");
            note.hidden = false;
          } else {
            note.hidden = true;
          }

          rememberRecipient(address);
        }
        break;
      }
      case "notfound": {
        badge.dataset.trust = "error";
        label.textContent = `❌ ${address}`;
        badge.title = "Not found – no explicit age key published for this address";
        pqBadge.hidden = true;
        if (warnings && warnings.length > 0) {
          note.textContent = formatWarnings(warnings)
            .map((w) => "⚠ " + w)
            .join(" ");
          note.hidden = false;
        } else {
          note.hidden = true;
        }
        break;
      }
      case "error":
        badge.dataset.trust = "error";
        label.textContent = `❌ ${address}`;
        badge.title = "Lookup failed";
        pqBadge.hidden = true;
        note.hidden = true;
        break;
    }
    updateUI();
  });
}

// --- Recipients input ---
recipientsInput.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" ||
    e.key === "," ||
    e.key === ";" ||
    e.key === "Tab" ||
    e.key === " "
  ) {
    e.preventDefault();
    commitRecipientsFromInput();
  }
  // Backspace on empty input removes last badge.
  if (e.key === "Backspace" && recipientsInput.value === "") {
    const wrappers = recipientsList.querySelectorAll(".recipient-wrapper");
    if (wrappers.length > 0) {
      const last = wrappers[wrappers.length - 1] as HTMLElement;
      const addr = last.dataset.address!;
      pendingAddresses.delete(addr);
      removeRecipient(addr);
      last.remove();
      updateUI();
    }
  }
});

// On touch devices there is no Tab key, so commit pending input when focus leaves the field.
recipientsInput.addEventListener("blur", () => {
  commitRecipientsFromInput();
});

// Pasting multiple recipients should create badges in one go.
recipientsInput.addEventListener("paste", () => {
  setTimeout(() => {
    if (/[\s,;]/.test(recipientsInput.value)) {
      commitRecipientsFromInput();
    }
  }, 0);
});

// Keep helper-link enablement in sync while typing.
recipientsInput.addEventListener("input", () => {
  updateUI();
});

// --- File handling ---
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer?.files) {
    addFiles(Array.from(e.dataTransfer.files));
  }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files) {
    addFiles(Array.from(fileInput.files));
    fileInput.value = "";
  }
});

// Re-evaluate send button (and size warning) when body text changes.
bodyInput.addEventListener("input", () => {
  updateSizeWarning();
  updateUI();
});

function addFiles(newFiles: File[]): void {
  for (const f of newFiles) {
    files.push(f);
  }
  renderFileList();
  updateSizeWarning();
  updateUI();
}

function renderFileList(): void {
  fileList.innerHTML = "";
  for (let i = 0; i < files.length; i++) {
    const li = document.createElement("li");
    const sizeKB = (files[i].size / 1024).toFixed(1);
    li.textContent = `${files[i].name} (${sizeKB} KB)`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "remove";
    removeBtn.addEventListener("click", () => {
      files.splice(i, 1);
      renderFileList();
      updateSizeWarning();
      updateUI();
    });
    li.appendChild(removeBtn);
    fileList.appendChild(li);
  }
}

// --- UI update ---
setUpdateCallback(updateUI);

function updateUI(): void {
  // Check that all pending addresses are resolved.
  let allFound = pendingAddresses.size > 0;
  for (const addr of pendingAddresses) {
    const resolved = getResolvedRecipients().find((r) => r.address === addr);
    if (!resolved) {
      allFound = false;
      break;
    }
  }

  // Send requires: all recipients found AND (message or attachments present).
  const hasContent = bodyInput.value.trim().length > 0 || files.length > 0;
  sendBtn.disabled = !(allFound && hasContent);

  // Copy-URL link is always visible but only enabled when at least one recipient exists.
  const hasRecipientsForLink = getLinkRecipients().length > 0;
  setCopyUrlLinkEnabled(hasRecipientsForLink);

  // Trust warning — only show for dns (amber) trust level.
  const worst = getWorstTrust();
  if (worst === "dns" && allFound) {
    trustWarning.hidden = false;
    trustWarningText.textContent =
      "One or more recipients were discovered via plain DNS (no DNSSEC). The key could be spoofed by a network attacker.";
  } else {
    trustWarning.hidden = true;
  }

  // Disable chips for currently-pending recipients.
  for (const chip of Array.from(recentRecipientsListEl.querySelectorAll<HTMLButtonElement>(".recent-chip"))) {
    const addr = chip.dataset.address ?? "";
    chip.disabled = pendingAddresses.has(addr);
  }
}

// --- Send record download ---
interface SendSnapshot {
  date: Date;
  results: RecipientSendResult[];
  subject: string;
  body: string;
  files: Array<{ name: string; size: number; type: string }>;
}

function buildRecordText(s: SendSnapshot): string {
  const lines: string[] = [];
  lines.push("agemail — send record");
  lines.push(`Date: ${s.date.toISOString()}`);
  lines.push("");
  lines.push(`Recipients (${s.results.length}):`);
  for (const r of s.results) {
    const status = r.ok ? "OK" : `FAILED: ${r.error ?? "unknown"}`;
    lines.push(`  - ${r.address}  [${status}]`);
  }
  lines.push("");
  lines.push(`Subject (not encrypted): ${s.subject || "(none)"}`);
  lines.push("");
  lines.push("Message:");
  lines.push(s.body || "(empty)");
  lines.push("");
  if (s.files.length > 0) {
    lines.push(`Attachments (${s.files.length}):`);
    for (const f of s.files) {
      const kb = (f.size / 1024).toFixed(1);
      lines.push(`  - ${f.name}  (${kb} KB, ${f.type || "unknown type"})`);
    }
  } else {
    lines.push("Attachments: none");
  }
  lines.push("");
  lines.push("Note: this record is for your reference. The message itself was end-to-end");
  lines.push("encrypted with age and is not stored anywhere outside the recipients' mailboxes.");
  return lines.join("\n");
}

function downloadRecord(s: SendSnapshot): void {
  const text = buildRecordText(s);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = s.date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `agemail-record-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function appendRecordDownloadButton(s: SendSnapshot): void {
  const wrap = document.createElement("div");
  wrap.className = "record-download";

  const note = document.createElement("span");
  note.className = "record-download-note";
  note.textContent = "Want a local copy of what you sent?";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "record-download-btn";
  btn.textContent = "Download record";
  btn.addEventListener("click", () => downloadRecord(s));

  wrap.appendChild(note);
  wrap.appendChild(btn);
  statusDiv.appendChild(wrap);
}

// --- Send ---
function renderSendResults(results: RecipientSendResult[]): void {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (failed.length === 0) {
    statusDiv.className = "status success";
    statusDiv.textContent =
      results.length === 1
        ? "Message sent successfully!"
        : `Message sent to all ${results.length} recipients.`;
    statusDiv.hidden = false;
    return;
  }

  if (ok.length === 0) {
    statusDiv.className = "status error";
    const lines = failed.map((r) => `${r.address}: ${r.error ?? "send failed"}`);
    statusDiv.textContent = `Send failed for all recipients.\n${lines.join("\n")}`;
    statusDiv.hidden = false;
    return;
  }

  statusDiv.className = "status partial";
  const okList = ok.map((r) => r.address).join(", ");
  const failLines = failed.map((r) => `${r.address}: ${r.error ?? "send failed"}`);
  statusDiv.textContent =
    `Sent to ${ok.length} of ${results.length} recipients.\n` +
    `Succeeded: ${okList}\n` +
    `Failed:\n${failLines.join("\n")}`;
  statusDiv.hidden = false;
}

sendBtn.addEventListener("click", async () => {
  sendBtn.disabled = true;
  statusDiv.hidden = true;
  progressSection.hidden = false;

  try {
    const results = await sendMessage(
      bodyInput.value,
      subjectInput.value,
      files,
      (p: SendProgress) => {
        switch (p.stage) {
          case "pow": {
            progressBar.style.width = `${powBarPercent(p.completionProbability)}%`;
            const who =
              p.recipientTotal > 1
                ? ` for recipient ${p.recipientIndex}/${p.recipientTotal} (${p.recipientAddress})`
                : "";
            progressText.textContent =
              `Solving proof of work${who} - ` +
              `${p.hashesChecked.toLocaleString()} / ~${Math.round(p.expectedHashes).toLocaleString()} hashes`;
            break;
          }
          case "encrypting": {
            progressBar.style.width = `${(p.current / p.total) * POW_PROGRESS_START}%`;
            const who =
              p.recipientTotal > 1
                ? ` for ${p.recipientIndex}/${p.recipientTotal}`
                : "";
            progressText.textContent = `Encrypting${who} (${p.current}/${p.total})…`;
            break;
          }
          case "uploading": {
            progressBar.style.width = "90%";
            const who =
              p.recipientTotal > 1
                ? ` to recipient ${p.recipientIndex}/${p.recipientTotal} (${p.recipientAddress})`
                : "";
            progressText.textContent = `Sending${who}…`;
            break;
          }
          case "done":
            progressBar.style.width = "100%";
            progressText.textContent = "Done!";
            break;
          case "error":
            progressText.textContent = p.message;
            break;
        }
      }
    );

    const snapshot: SendSnapshot = {
      date: new Date(),
      results,
      subject: subjectInput.value,
      body: bodyInput.value,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    };

    renderSendResults(results);

    const anySucceeded = results.some((r) => r.ok);
    if (anySucceeded) {
      appendRecordDownloadButton(snapshot);

      // Reset form fields and recipient list.
      bodyInput.value = "";
      subjectInput.value = "";
      files.length = 0;
      renderFileList();
      recipientsList.innerHTML = "";
      pendingAddresses.clear();
      clearRecipients();
      updateSizeWarning();
      updateUI();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Send failed";
    statusDiv.className = "status error";
    statusDiv.textContent = msg;
    statusDiv.hidden = false;
  } finally {
    progressSection.hidden = true;
    progressBar.style.width = "0%";
    sendBtn.disabled = false;
    updateUI();
  }
});

// --- Privacy notice ---
const PRIVACY_NOTICE_STORAGE_KEY = "agemail.privacy-notice-dismissed-at";
const PRIVACY_NOTICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const privacyNotice = document.getElementById("privacy-notice") as HTMLElement | null;
const privacyNoticeDismiss = document.getElementById("privacy-notice-dismiss") as HTMLButtonElement | null;
if (privacyNotice && privacyNoticeDismiss) {
  const raw = localStorage.getItem(PRIVACY_NOTICE_STORAGE_KEY);
  const dismissedAt = raw ? parseInt(raw, 10) : 0;
  const expired = !dismissedAt || Date.now() - dismissedAt > PRIVACY_NOTICE_TTL_MS;
  if (expired) {
    privacyNotice.hidden = false;
  }
  privacyNoticeDismiss.addEventListener("click", () => {
    privacyNotice.hidden = true;
    try {
      localStorage.setItem(PRIVACY_NOTICE_STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage may be unavailable (private mode); the notice will reappear next load.
    }
  });
}

// --- Recent recipients (load from localStorage) ---
renderRecentRecipients();

// --- Deep-link ---
applyDeepLink(recipientsInput, bodyInput, subjectInput, addRecipientBadge);
initDebugSection();
updateUI();

// --- Copy URL with recipients ---
copyUrlLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (copyUrlLink.classList.contains("disabled")) {
    return;
  }
  const recipients = getLinkRecipients();
  if (recipients.length === 0) {
    return;
  }
  const to = recipients.join(",");
  const url = `${location.origin}${location.pathname}#to=${encodeURIComponent(to)}`;
  navigator.clipboard.writeText(url).then(() => {
    const original = copyUrlLink.textContent;
    copyUrlLink.textContent = "Copied!";
    setTimeout(() => { copyUrlLink.textContent = original; }, 1500);
  });
});
