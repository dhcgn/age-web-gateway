import { describe, it } from "node:test";
import assert from "node:assert/strict";

// recent-recipients.ts pulls DOM elements at import time; stub document
// first and import lazily. Only the storage/list logic is exercised here.
(globalThis as unknown as { document: unknown }).document = {
  getElementById: () => null,
};

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  return store;
}

const {
  loadRecentRecipients,
  saveRecentRecipients,
  addToRecent,
  removeFromRecent,
} = await import("./recent-recipients.ts");

describe("loadRecentRecipients", () => {
  it("returns empty for missing or corrupt data", () => {
    stubStorage();
    assert.deepStrictEqual(loadRecentRecipients(), []);
    localStorage.setItem("agemail.recent-recipients", "not json{");
    assert.deepStrictEqual(loadRecentRecipients(), []);
    localStorage.setItem("agemail.recent-recipients", JSON.stringify({ a: 1 }));
    assert.deepStrictEqual(loadRecentRecipients(), []);
  });

  it("filters out non-string entries", () => {
    stubStorage();
    localStorage.setItem(
      "agemail.recent-recipients",
      JSON.stringify(["a@x.de", 42, null, "b@y.de"])
    );
    assert.deepStrictEqual(loadRecentRecipients(), ["a@x.de", "b@y.de"]);
  });
});

describe("saveRecentRecipients", () => {
  it("round-trips through load", () => {
    stubStorage();
    saveRecentRecipients(["a@x.de", "b@y.de"]);
    assert.deepStrictEqual(loadRecentRecipients(), ["a@x.de", "b@y.de"]);
  });
});

describe("addToRecent", () => {
  it("unshifts and dedupes case-insensitively", () => {
    assert.deepStrictEqual(addToRecent(["b@y.de"], "a@x.de"), ["a@x.de", "b@y.de"]);
    assert.deepStrictEqual(addToRecent(["a@x.de", "b@y.de"], "A@X.DE"), ["A@X.DE", "b@y.de"]);
  });

  it("ignores blank addresses and caps length", () => {
    assert.deepStrictEqual(addToRecent(["a@x.de"], "  "), ["a@x.de"]);
    assert.deepStrictEqual(addToRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
  });
});

describe("removeFromRecent", () => {
  it("removes case-insensitively and trims", () => {
    assert.deepStrictEqual(removeFromRecent(["a@x.de", "b@y.de"], " A@X.de "), [
      "b@y.de",
    ]);
    assert.deepStrictEqual(removeFromRecent(["a@x.de"], "missing@y.de"), ["a@x.de"]);
  });
});
