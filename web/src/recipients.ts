import { solvePoW, getDifficulty } from "./pow";

export interface LookupResult {
  recipient: string;
  found: boolean;
  trust?: "https" | "dnssec" | "dns";
  recipients?: string[];
}

export interface ResolvedRecipient {
  address: string;
  trust: "https" | "dnssec" | "dns";
  keys: string[];
}

const resolved = new Map<string, ResolvedRecipient>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getResolvedRecipients(): ResolvedRecipient[] {
  return Array.from(resolved.values());
}

export function getAllKeys(): string[] {
  const keys = new Set<string>();
  for (const r of resolved.values()) {
    for (const k of r.keys) {
      keys.add(k);
    }
  }
  return Array.from(keys);
}

export function getWorstTrust(): "https" | "dnssec" | "dns" | null {
  const trustOrder: Record<string, number> = { https: 3, dnssec: 2, dns: 1 };
  let worst: string | null = null;
  let worstScore = Infinity;
  for (const r of resolved.values()) {
    const score = trustOrder[r.trust] ?? 0;
    if (score < worstScore) {
      worstScore = score;
      worst = r.trust;
    }
  }
  return worst as "https" | "dnssec" | "dns" | null;
}

export function isAllResolved(): boolean {
  return resolved.size > 0;
}

export function removeRecipient(address: string): void {
  resolved.delete(address);
}

export function clearRecipients(): void {
  resolved.clear();
}

type UpdateCallback = () => void;
let onUpdate: UpdateCallback = () => {};

export function setUpdateCallback(cb: UpdateCallback): void {
  onUpdate = cb;
}

export async function lookupRecipient(
  address: string,
  setStatus?: (status: "loading" | "found" | "notfound" | "error") => void
): Promise<void> {
  address = address.trim();
  if (!address) return;

  if (setStatus) setStatus("loading");

  try {
    const difficulty = getDifficulty();
    const powToken = await solvePoW(difficulty);

    const resp = await fetch(
      `/api/lookup?recipient=${encodeURIComponent(address)}`,
      {
        headers: { "X-PoW": powToken },
      }
    );

    if (!resp.ok) {
      if (setStatus) setStatus("error");
      return;
    }

    const data: LookupResult = await resp.json();

    if (data.found && data.trust && data.recipients && data.recipients.length > 0) {
      resolved.set(address, {
        address,
        trust: data.trust,
        keys: data.recipients,
      });
      if (setStatus) setStatus("found");
    } else {
      resolved.delete(address);
      if (setStatus) setStatus("notfound");
    }
  } catch {
    resolved.delete(address);
    if (setStatus) setStatus("error");
  }

  onUpdate();
}

export function debouncedLookup(
  address: string,
  setStatus?: (status: "loading" | "found" | "notfound" | "error") => void,
  delayMs = 300
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    lookupRecipient(address, setStatus);
  }, delayMs);
}

export function trustIcon(trust: string): string {
  switch (trust) {
    case "https":
      return "🔒";
    case "dnssec":
      return "🛡️";
    case "dns":
      return "⚠️";
    default:
      return "❌";
  }
}

export function trustLabel(trust: string): string {
  switch (trust) {
    case "https":
      return "verified via HTTPS";
    case "dnssec":
      return "verified via DNSSEC";
    case "dns":
      return "found, but not verified";
    default:
      return "not found";
  }
}
