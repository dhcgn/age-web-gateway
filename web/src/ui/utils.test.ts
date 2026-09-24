import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  POW_PROGRESS_START,
  POW_PROGRESS_END,
  powBarPercent,
  parseRecipientTokens,
  formatWarning,
  formatWarnings,
} from "./utils.ts";

describe("powBarPercent", () => {
  it("maps probability onto the progress band with clamping", () => {
    const span = POW_PROGRESS_END - POW_PROGRESS_START;
    assert.strictEqual(powBarPercent(0), POW_PROGRESS_START);
    assert.strictEqual(powBarPercent(0.99), POW_PROGRESS_START + 0.99 * span);
    assert.strictEqual(powBarPercent(1), POW_PROGRESS_START + 0.99 * span);
    assert.strictEqual(powBarPercent(-0.5), POW_PROGRESS_START);
    assert.strictEqual(powBarPercent(0.5), POW_PROGRESS_START + 0.5 * span);
  });
});

describe("parseRecipientTokens", () => {
  it("splits on whitespace, commas and semicolons", () => {
    assert.deepStrictEqual(parseRecipientTokens("a@x.de, b@y.de;c@d.e f@g.h"), [
      "a@x.de",
      "b@y.de",
      "c@d.e",
      "f@g.h",
    ]);
  });

  it("trims entries and drops empties", () => {
    assert.deepStrictEqual(parseRecipientTokens("  a@x.de ,,;\t"), ["a@x.de"]);
    assert.deepStrictEqual(parseRecipientTokens(""), []);
  });
});

describe("formatWarning", () => {
  it("strips detail from malformed-record warnings", () => {
    assert.strictEqual(
      formatWarning("ignored malformed record: line 3 is bogus"),
      "ignored malformed record"
    );
  });

  it("passes other warnings through", () => {
    assert.strictEqual(formatWarning("something else"), "something else");
  });
});

describe("formatWarnings", () => {
  it("dedupes while keeping first-seen order", () => {
    assert.deepStrictEqual(
      formatWarnings([
        "ignored malformed record: line 1",
        "other",
        "ignored malformed record: line 2",
        "other",
      ]),
      ["ignored malformed record", "other"]
    );
  });

  it("handles empty input", () => {
    assert.deepStrictEqual(formatWarnings([]), []);
  });
});
