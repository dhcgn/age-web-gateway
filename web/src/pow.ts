/**
 * Proof-of-Work solver using Web Crypto API.
 * Finds a nonce such that SHA-256(ts || nonce) has >= difficulty leading zero bits.
 */

export interface PoWProgress {
  hashesChecked: number;
  difficulty: number;
  expectedHashes: number;
  completionProbability: number;
}

export type PoWProgressCallback = (progress: PoWProgress) => void;

export function expectedHashesForDifficulty(difficulty: number): number {
  return Math.pow(2, Math.max(0, difficulty));
}

export function expectedHashesByDifficultyRange(min: number, max: number): Array<{ difficulty: number; expectedHashes: number }> {
  const out: Array<{ difficulty: number; expectedHashes: number }> = [];
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  for (let d = start; d <= end; d++) {
    out.push({
      difficulty: d,
      expectedHashes: expectedHashesForDifficulty(d),
    });
  }
  return out;
}

export function getDifficulty(): number {
  const meta = document.querySelector('meta[name="pow-difficulty"]');
  if (meta) {
    const val = parseInt(meta.getAttribute("content") || "4", 10);
    return isNaN(val) ? 4 : val;
  }
  return 4;
}

export function getSendDifficulty(): number {
  const meta = document.querySelector('meta[name="pow-difficulty-send"]');
  if (meta) {
    const val = parseInt(meta.getAttribute("content") || "", 10);
    if (!isNaN(val)) {
      return val;
    }
  }
  return getDifficulty();
}

export async function solvePoW(
  difficulty: number,
  onProgress?: PoWProgressCallback
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();
  let nonce = 0;
  const batchSize = 5000;
  const expectedHashes = expectedHashesForDifficulty(difficulty);

  while (true) {
    for (let i = 0; i < batchSize; i++) {
      const preimage = ts + nonce.toString();
      const data = encoder.encode(preimage);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = new Uint8Array(hashBuffer);

      if (countLeadingZeroBits(hashArray) >= difficulty) {
        return ts + "." + nonce.toString();
      }
      nonce++;
    }

    if (onProgress) {
      // Model completion as 1 - exp(-k / E[k]), which is a smooth approximation for geometric trials.
      const completionProbability = 1 - Math.exp(-nonce / expectedHashes);
      onProgress({
        hashesChecked: nonce,
        difficulty,
        expectedHashes,
        completionProbability,
      });
    }
    // Yield to the event loop so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }
}

function countLeadingZeroBits(hash: Uint8Array): number {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit--) {
      if (byte & (1 << bit)) {
        return count;
      }
      count++;
    }
    break;
  }
  return count;
}
