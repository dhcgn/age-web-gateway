/**
 * Proof-of-Work solver using Web Crypto API.
 * Finds a nonce such that SHA-256(ts || nonce) has >= difficulty leading zero bits.
 */

export type PoWProgressCallback = (hashesChecked: number) => void;

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
      onProgress(nonce);
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
