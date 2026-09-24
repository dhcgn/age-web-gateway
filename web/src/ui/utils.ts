// Pure UI helpers (no DOM, no state) — covered by unit tests.

export const POW_PROGRESS_START = 15;
export const POW_PROGRESS_END = 78;

export function powBarPercent(completionProbability: number): number {
  const clamped = Math.max(0, Math.min(0.99, completionProbability));
  return POW_PROGRESS_START + clamped * (POW_PROGRESS_END - POW_PROGRESS_START);
}

export function parseRecipientTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// formatWarning strips low-level detail from server warnings so the UI
// shows a short, human-readable label rather than a raw record line.
export function formatWarning(w: string): string {
  if (w.startsWith("ignored malformed record")) {
    return "ignored malformed record";
  }
  return w;
}

export function formatWarnings(warnings: string[]): string[] {
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
