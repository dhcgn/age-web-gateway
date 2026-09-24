import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countLeadingZeroBits,
  expectedHashesForDifficulty,
  getDifficulty,
  getSendDifficulty,
  solvePoW,
} from "./pow.ts";

describe("expectedHashesForDifficulty", () => {
  it("returns powers of two", () => {
    assert.strictEqual(expectedHashesForDifficulty(0), 1);
    assert.strictEqual(expectedHashesForDifficulty(1), 2);
    assert.strictEqual(expectedHashesForDifficulty(4), 16);
    assert.strictEqual(expectedHashesForDifficulty(20), 2 ** 20);
  });

  it("clamps negative difficulty to zero", () => {
    assert.strictEqual(expectedHashesForDifficulty(-5), 1);
  });
});

describe("countLeadingZeroBits", () => {
  it("counts across byte boundaries", () => {
    assert.strictEqual(countLeadingZeroBits(new Uint8Array([])), 0);
    assert.strictEqual(countLeadingZeroBits(new Uint8Array([0xff])), 0);
    assert.strictEqual(countLeadingZeroBits(new Uint8Array([0x01])), 7);
    assert.strictEqual(countLeadingZeroBits(new Uint8Array([0x80])), 0);
    assert.strictEqual(
      countLeadingZeroBits(new Uint8Array([0x00, 0x00, 0x0f])),
      20
    );
    assert.strictEqual(
      countLeadingZeroBits(new Uint8Array([0x00, 0x00, 0x00])),
      24
    );
  });
});

describe("solvePoW", () => {
  it("returns a ts.nonce token at difficulty 0", async () => {
    const token = await solvePoW(0);
    const dot = token.indexOf(".");
    assert.ok(dot > 0, "expected ts.nonce format, got " + token);
    const ts = Number(token.slice(0, dot));
    const nonce = token.slice(dot + 1);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(ts <= now && ts >= now - 5, "timestamp is current");
    assert.match(nonce, /^\d+$/);
  });

  it("produces distinct tokens via random nonce start", async () => {
    const a = await solvePoW(0);
    const b = await solvePoW(0);
    assert.notStrictEqual(a, b);
  });

  it("token hash meets the requested difficulty", async () => {
    const difficulty = 8;
    const token = await solvePoW(difficulty);
    const dot = token.indexOf(".");
    // Preimage is ts + nonce without the separator (see solvePoW).
    const preimage = token.slice(0, dot) + token.slice(dot + 1);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage))
    );
    assert.ok(
      countLeadingZeroBits(digest) >= difficulty,
      "token does not meet difficulty"
    );
  });

  it("reports progress for nontrivial difficulty", async () => {
    // A solution can land inside the first 5000-hash batch, before any
    // progress callback fires, so retry a few times. All retries solving
    // instantly is astronomically unlikely and means progress broke.
    for (let attempt = 0; attempt < 3; attempt++) {
      let calls = 0;
      const seen: Array<{ difficulty: number; expectedHashes: number }> = [];
      let lastHashes = 0;
      await solvePoW(18, (p) => {
        calls++;
        lastHashes = p.hashesChecked;
        seen.push({ difficulty: p.difficulty, expectedHashes: p.expectedHashes });
      });
      if (calls > 0) {
        assert.ok(lastHashes > 0);
        for (const s of seen) {
          assert.strictEqual(s.difficulty, 18);
          assert.strictEqual(s.expectedHashes, 2 ** 18);
        }
        return;
      }
    }
    assert.fail("expected at least one progress callback in 3 attempts");
  });
});

describe("difficulty from meta tags", () => {
  const g = globalThis as unknown as { document: unknown };
  const realDocument = g.document;

  function stubMeta(content: string | null): void {
    const meta = content === null ? null : { getAttribute: () => content };
    g.document = { querySelector: () => meta } as unknown as Document;
  }

  it("getDifficulty defaults to 4 without a meta tag", () => {
    stubMeta(null);
    try {
      assert.strictEqual(getDifficulty(), 4);
    } finally {
      g.document = realDocument;
    }
  });

  it("getDifficulty parses the meta content", () => {
    stubMeta("17");
    try {
      assert.strictEqual(getDifficulty(), 17);
    } finally {
      g.document = realDocument;
    }
  });

  it("getDifficulty falls back to 4 for garbage", () => {
    stubMeta("lots");
    try {
      assert.strictEqual(getDifficulty(), 4);
    } finally {
      g.document = realDocument;
    }
  });

  it("getSendDifficulty falls back to the lookup difficulty", () => {
    stubMeta(null);
    try {
      assert.strictEqual(getSendDifficulty(), 4);
    } finally {
      g.document = realDocument;
    }
  });

  it("getSendDifficulty prefers its own meta tag", () => {
    stubMeta("20");
    try {
      assert.strictEqual(getSendDifficulty(), 20);
    } finally {
      g.document = realDocument;
    }
  });
});
