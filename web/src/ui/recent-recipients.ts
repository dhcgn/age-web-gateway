// Recent-recipients: localStorage-backed MRU list rendered as chips.
// Shell coupling (pending set, badge creation, UI refresh) arrives via deps;
// the list operations are pure and unit-tested.
import {
  recentRecipientsBox,
  recentRecipientsListEl,
  recentRecipientsClearBtn,
} from "./elements.ts";

export interface RecentRecipientsDeps {
  isPending(address: string): boolean;
  select(address: string): void;
}

const RECENT_RECIPIENTS_STORAGE_KEY = "agemail.recent-recipients";
const RECENT_RECIPIENTS_MAX = 15;

export function loadRecentRecipients(): string[] {
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

export function saveRecentRecipients(list: string[]): void {
  try {
    localStorage.setItem(RECENT_RECIPIENTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore (private mode / quota)
  }
}

export function addToRecent(list: string[], address: string, max = RECENT_RECIPIENTS_MAX): string[] {
  const norm = address.trim();
  if (!norm) return list;
  const next = [norm, ...list.filter((a) => a.toLowerCase() !== norm.toLowerCase())];
  if (next.length > max) next.length = max;
  return next;
}

export function removeFromRecent(list: string[], address: string): string[] {
  const norm = address.trim().toLowerCase();
  return list.filter((a) => a.toLowerCase() !== norm);
}

export function rememberRecipient(address: string, deps: RecentRecipientsDeps): void {
  saveRecentRecipients(addToRecent(loadRecentRecipients(), address));
  renderRecentRecipients(deps);
}

export function forgetRecipient(address: string, deps: RecentRecipientsDeps): void {
  saveRecentRecipients(removeFromRecent(loadRecentRecipients(), address));
  renderRecentRecipients(deps);
}

export function forgetAllRecipients(deps: RecentRecipientsDeps): void {
  saveRecentRecipients([]);
  renderRecentRecipients(deps);
}

export function renderRecentRecipients(deps: RecentRecipientsDeps): void {
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
      forgetRecipient(address, deps);
    });
    chip.appendChild(removeSpan);

    chip.disabled = deps.isPending(address);
    chip.addEventListener("click", () => {
      if (deps.isPending(address)) return;
      deps.select(address);
    });

    recentRecipientsListEl.appendChild(chip);
  }
}

export function initRecentRecipients(deps: RecentRecipientsDeps): void {
  recentRecipientsClearBtn.addEventListener("click", () => {
    if (loadRecentRecipients().length === 0) return;
    if (confirm("Remove all recent recipients?")) {
      forgetAllRecipients(deps);
    }
  });
  renderRecentRecipients(deps);
}
