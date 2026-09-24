// Localhost-only debug section (PoW difficulty override + solver benchmark).
// Self-contained: only needs pow.ts and its own DOM elements.
import { solvePoW, getDifficulty } from "../pow.ts";
import {
  debugSection,
  debugDifficultyInput,
  debugApplyDifficultyBtn,
  debugCurrentDifficulty,
  debugTestPowBtn,
  debugPowResult,
} from "./elements.ts";

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

export function initDebugSection(): void {
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
    // Local aliases: narrowing an imported binding does not carry into the
    // nested progress closure, but narrowing a local const does.
    const resultEl = debugPowResult;
    const testBtn = debugTestPowBtn;
    if (!resultEl || !testBtn) {
      return;
    }

    const difficulty = getDifficulty();
    let hashesChecked = 0;
    const started = performance.now();

    testBtn.disabled = true;
    resultEl.textContent = `Running PoW test at difficulty ${difficulty}...`;

    try {
      const token = await solvePoW(difficulty, (progress) => {
        hashesChecked = progress.hashesChecked;
        resultEl.textContent = `Running PoW test at difficulty ${difficulty}...\nTried ${hashesChecked.toLocaleString()} hashes.`;
      });
      const elapsedMs = Math.round(performance.now() - started);
      resultEl.textContent =
        `Done.\n` +
        `Difficulty: ${difficulty}\n` +
        `Time: ${elapsedMs} ms\n` +
        `Hashes checked: ${hashesChecked.toLocaleString()}\n` +
        `Token: ${token}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PoW test failed";
      resultEl.textContent = `Error: ${msg}`;
    } finally {
      testBtn.disabled = false;
    }
  });
}
