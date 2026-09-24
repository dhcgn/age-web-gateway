import {
  lookupRecipient,
  removeRecipient,
  getResolvedRecipients,
  getWorstTrust,
  setUpdateCallback,
  trustIcon,
  trustLabel,
  clearRecipients,
  isPQKey,
} from "./recipients";
import { sendMessage } from "./send";
import type { SendProgress, RecipientSendResult } from "./send";
import { applyDeepLink } from "./deeplink";
import {
  recipientsInput,
  recipientsList,
  trustWarning,
  trustWarningText,
  bodyInput,
  subjectInput,
  dropZone,
  fileInput,
  fileList,
  progressSection,
  progressBar,
  progressText,
  sendBtn,
  sizeWarning,
  sizeWarningText,
  recentRecipientsListEl,
  statusDiv,
  copyUrlLink,
  privacyNotice,
  privacyNoticeDismiss,
} from "./ui/elements";
import {
  POW_PROGRESS_START,
  powBarPercent,
  parseRecipientTokens,
  formatWarnings,
} from "./ui/utils";
import { initDebugSection } from "./ui/debug";
import { appendRecordDownloadButton } from "./ui/send-record";
import type { SendSnapshot } from "./ui/send-record";
import { consumeSharedPayload } from "./ui/share-intake";
import {
  initRecentRecipients,
  rememberRecipient,
} from "./ui/recent-recipients";
import type { RecentRecipientsDeps } from "./ui/recent-recipients";
import type { ShareIntakeDeps } from "./ui/share-intake";

function getMaxSizeMB(): number {
  const meta = document.querySelector('meta[name="mail-backend-max-size-mb"]');
  if (meta) {
    const val = parseInt(meta.getAttribute("content") || "10", 10);
    return isNaN(val) ? 10 : val;
  }
  return 10; // default fallback
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function updateSizeWarning(): void {
  const maxSizeMB = getMaxSizeMB();
  const SIZE_WARN_BYTES = maxSizeMB * 1024 * 1024;
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
// --- State ---
const pendingAddresses = new Set<string>();
const files: File[] = [];

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

          rememberRecipient(address, recentDeps);
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
    const f = files[i];
    if (!f) continue;
    const li = document.createElement("li");
    const sizeKB = (f.size / 1024).toFixed(1);
    li.textContent = `${f.name} (${sizeKB} KB)`;
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
          default:
            throw new Error(`Unhandled progress stage: ${p satisfies never}`);
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
// Local aliases: narrowing an imported binding does not carry into the nested
// click closure, but narrowing a local const does.
const noticeEl = privacyNotice;
const noticeDismissBtn = privacyNoticeDismiss;
if (noticeEl && noticeDismissBtn) {
  const raw = localStorage.getItem(PRIVACY_NOTICE_STORAGE_KEY);
  const dismissedAt = raw ? parseInt(raw, 10) : 0;
  const expired = !dismissedAt || Date.now() - dismissedAt > PRIVACY_NOTICE_TTL_MS;
  if (expired) {
    noticeEl.hidden = false;
  }
  noticeDismissBtn.addEventListener("click", () => {
    noticeEl.hidden = true;
    try {
      localStorage.setItem(PRIVACY_NOTICE_STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage may be unavailable (private mode); the notice will reappear next load.
    }
  });
}

// --- Recent recipients (load from localStorage) ---
const recentDeps: RecentRecipientsDeps = {
  isPending: (address) => pendingAddresses.has(address),
  select: (address) => {
    addRecipientBadge(address);
    updateUI();
  },
};

const shareDeps: ShareIntakeDeps = {
  addFiles,
  refresh: () => {
    updateSizeWarning();
    updateUI();
  },
};

initRecentRecipients(recentDeps);

// --- Deep-link ---
applyDeepLink(bodyInput, subjectInput, addRecipientBadge);
initDebugSection();
updateUI();
void consumeSharedPayload(shareDeps);

// Register the service worker (share target + installability). The app works
// fully without it; failure just means those extras are unavailable.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // ignore (e.g. insecure context)
  });
}

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
