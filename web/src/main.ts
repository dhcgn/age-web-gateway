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
import { sendMessage, SendProgress } from "./send";
import { applyDeepLink } from "./deeplink";

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

// --- State ---
const pendingAddresses = new Set<string>();
const files: File[] = [];

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
  if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
    e.preventDefault();
    const value = recipientsInput.value.replace(",", "").trim();
    if (value) {
      addRecipientBadge(value);
      recipientsInput.value = "";
    }
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
          progressBar.style.width = "10%";
          progressText.textContent = "Solving proof of work…";
          break;
        case "encrypting":
          progressBar.style.width = `${10 + (p.current / p.total) * 60}%`;
          progressText.textContent = `Encrypting (${p.current}/${p.total})…`;
          break;
        case "uploading":
          progressBar.style.width = "80%";
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
