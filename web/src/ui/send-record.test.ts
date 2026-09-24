import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SendSnapshot } from "./send-record.ts";
import type { RecipientSendResult } from "../send.ts";

// send-record.ts pulls DOM elements at import time; stub document first and
// import lazily. Only buildRecordText (pure) is exercised here.
(globalThis as unknown as { document: unknown }).document = {
  getElementById: () => null,
};

const { buildRecordText } = await import("./send-record.ts");

function snapshot(overrides: Partial<SendSnapshot> = {}): SendSnapshot {
  return {
    date: new Date("2026-09-24T10:00:00.000Z"),
    results: [{ address: "a@x.de", ok: true }],
    subject: "hello",
    body: "secret message",
    files: [],
    ...overrides,
  };
}

describe("buildRecordText", () => {
  it("renders a successful send without attachments", () => {
    const text = buildRecordText(snapshot());
    assert.ok(text.includes("Recipients (1):"));
    assert.ok(text.includes("a@x.de  [OK]"));
    assert.ok(text.includes("Subject (not encrypted): hello"));
    assert.ok(text.includes("secret message"));
    assert.ok(text.includes("Attachments: none"));
  });

  it("renders mixed results with failure reasons", () => {
    const results: Array<RecipientSendResult> = [
      { address: "a@x.de", ok: true },
      { address: "b@y.de", ok: false, error: "boom" },
      { address: "c@z.de", ok: false },
    ];
    const text = buildRecordText(snapshot({ results }));
    assert.ok(text.includes("a@x.de  [OK]"));
    assert.ok(text.includes("b@y.de  [FAILED: boom]"));
    assert.ok(text.includes("c@z.de  [FAILED: unknown]"));
  });

  it("renders attachments and defaults for empty subject/body", () => {
    const text = buildRecordText(
      snapshot({
        subject: "",
        body: "",
        files: [
          { name: "a.txt", size: 2048, type: "text/plain" },
          { name: "blob", size: 512, type: "" },
        ],
      })
    );
    assert.ok(text.includes("Subject (not encrypted): (none)"));
    assert.ok(text.includes("Attachments (2):"));
    assert.ok(text.includes("a.txt  (2.0 KB, text/plain)"));
    assert.ok(text.includes("blob  (0.5 KB, unknown type)"));
  });
});
