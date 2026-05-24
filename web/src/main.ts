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
} from "./recipients";
import { solvePoW, getDifficulty } from "./pow";
import { sendMessage, SendProgress } from "./send";
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
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const progressSection = document.getElementById("progress-section") as HTMLDivElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
const progressText = document.getElementById("progress-text") as HTMLSpanElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
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

// --- Recipient badge management ---
function addRecipientBadge(address: string): void {
  if (pendingAddresses.has(address)) return;
  pendingAddresses.add(address);

  const badge = document.createElement("span");
  badge.className = "recipient-badge";
  badge.dataset.address = address;
  badge.dataset.trust = "loading";
  badge.textContent = address;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", () => {
    pendingAddresses.delete(address);
    removeRecipient(address);
    badge.remove();
    updateUI();
  });
  badge.appendChild(removeBtn);
  recipientsList.appendChild(badge);

  // Trigger lookup.
  lookupRecipient(address, (status) => {
    switch (status) {
      case "loading":
        badge.dataset.trust = "loading";
        badge.title = "Looking up…";
        break;
      case "found": {
        const resolved = getResolvedRecipients().find((r) => r.address === address);
        if (resolved) {
          badge.dataset.trust = resolved.trust;
          badge.title = `${trustIcon(resolved.trust)} ${trustLabel(resolved.trust)}`;
          badge.childNodes[0].textContent = `${trustIcon(resolved.trust)} ${address} `;
        }
        break;
      }
      case "notfound":
        badge.dataset.trust = "error";
        badge.childNodes[0].textContent = `❌ ${address} `;
        badge.title = "Not found – no age key published";
        break;
      case "error":
        badge.dataset.trust = "error";
        badge.childNodes[0].textContent = `❌ ${address} `;
        badge.title = "Lookup failed";
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
    const badges = recipientsList.querySelectorAll(".recipient-badge");
    if (badges.length > 0) {
      const last = badges[badges.length - 1] as HTMLElement;
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

// Re-evaluate send button when body text changes.
bodyInput.addEventListener("input", () => updateUI());

function addFiles(newFiles: File[]): void {
  for (const f of newFiles) {
    files.push(f);
  }
  renderFileList();
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
}

// --- Send ---
sendBtn.addEventListener("click", async () => {
  sendBtn.disabled = true;
  statusDiv.hidden = true;
  progressSection.hidden = false;

  try {
    await sendMessage(bodyInput.value, files, (p: SendProgress) => {
      switch (p.stage) {
        case "pow":
          progressBar.style.width = `${powBarPercent(p.completionProbability)}%`;
          progressText.textContent =
            `Solving proof of work (difficulty ${p.difficulty}) - ` +
            `${p.hashesChecked.toLocaleString()} / ~${Math.round(p.expectedHashes).toLocaleString()} hashes`;
          break;
        case "encrypting":
          progressBar.style.width = `${(p.current / p.total) * POW_PROGRESS_START}%`;
          progressText.textContent = `Encrypting (${p.current}/${p.total})…`;
          break;
        case "uploading":
          progressBar.style.width = "90%";
          progressText.textContent = "Sending…";
          break;
        case "done":
          progressBar.style.width = "100%";
          progressText.textContent = "Done!";
          break;
        case "error":
          progressText.textContent = p.message;
          break;
      }
    });

    statusDiv.className = "status success";
    statusDiv.textContent = "Message sent successfully!";
    statusDiv.hidden = false;

    // Reset form.
    bodyInput.value = "";
    files.length = 0;
    renderFileList();
    recipientsList.innerHTML = "";
    pendingAddresses.clear();
    clearRecipients();
    updateUI();
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

// --- Deep-link ---
applyDeepLink(recipientsInput, bodyInput, addRecipientBadge);
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
