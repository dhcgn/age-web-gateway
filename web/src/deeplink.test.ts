import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyDeepLink, parseDeepLink } from "./deeplink.ts";

interface FakeLocation {
  hash: string;
  pathname: string;
  search: string;
}

const g = globalThis as unknown as {
  window: { location: FakeLocation } | undefined;
  history: { replaceState: (...args: Array<unknown>) => void } | undefined;
};
const realWindow = g.window;
const realHistory = g.history;

function stubBrowser(
  hash: string,
  onReplaceState?: (url: string) => void
): void {
  g.window = { location: { hash, pathname: "/index.html", search: "" } };
  g.history = {
    replaceState: (...args: Array<unknown>) => {
      onReplaceState?.(String(args[2]));
    },
  };
}

function restoreBrowser(): void {
  g.window = realWindow;
  g.history = realHistory;
}

function fakeInput(value = ""): HTMLInputElement {
  return { value } as HTMLInputElement;
}

function fakeTextArea(value = ""): HTMLTextAreaElement {
  return { value } as HTMLTextAreaElement;
}

describe("parseDeepLink", () => {
  it("returns empty defaults without a fragment", () => {
    stubBrowser("");
    try {
      assert.deepStrictEqual(parseDeepLink(), {
        to: [],
        body: "",
        subject: "",
      });
    } finally {
      restoreBrowser();
    }
  });

  it("parses recipients, body and subject", () => {
    stubBrowser("#to=a@x.de,b@y.de&body=hello&subject=hi");
    try {
      assert.deepStrictEqual(parseDeepLink(), {
        to: ["a@x.de", "b@y.de"],
        body: "hello",
        subject: "hi",
      });
    } finally {
      restoreBrowser();
    }
  });

  it("trims entries and drops empties", () => {
    stubBrowser("#to= a@x.de ,,b@y.de,");
    try {
      assert.deepStrictEqual(parseDeepLink().to, ["a@x.de", "b@y.de"]);
    } finally {
      restoreBrowser();
    }
  });

  it("decodes percent-encoded values", () => {
    stubBrowser("#body=Hello%20there&subject=Re%3A+hi");
    try {
      const parsed = parseDeepLink();
      assert.strictEqual(parsed.body, "Hello there");
      assert.strictEqual(parsed.subject, "Re: hi");
    } finally {
      restoreBrowser();
    }
  });

  it("defaults missing keys to empty", () => {
    stubBrowser("#to=a@x.de");
    try {
      const parsed = parseDeepLink();
      assert.deepStrictEqual(parsed.to, ["a@x.de"]);
      assert.strictEqual(parsed.body, "");
      assert.strictEqual(parsed.subject, "");
    } finally {
      restoreBrowser();
    }
  });
});

describe("applyDeepLink", () => {
  it("prefills fields, adds badges and strips the fragment", () => {
    const replaced: Array<string> = [];
    stubBrowser("#to=a@x.de,b@y.de&body=hello&subject=hi", (url) => {
      replaced.push(url);
    });
    try {
      const recipientsInput = fakeInput();
      const bodyInput = fakeTextArea();
      const subjectInput = fakeInput();
      const badged: Array<string> = [];
      applyDeepLink(recipientsInput, bodyInput, subjectInput, (addr) => {
        badged.push(addr);
      });
      assert.strictEqual(bodyInput.value, "hello");
      assert.strictEqual(subjectInput.value, "hi");
      assert.deepStrictEqual(badged, ["a@x.de", "b@y.de"]);
      assert.deepStrictEqual(replaced, ["/index.html"]);
    } finally {
      restoreBrowser();
    }
  });

  it("does nothing without a fragment", () => {
    let replaced = 0;
    stubBrowser("", () => {
      replaced++;
    });
    try {
      const badged: Array<string> = [];
      applyDeepLink(
        fakeInput("untouched"),
        fakeTextArea(),
        fakeInput(),
        (addr) => {
          badged.push(addr);
        }
      );
      assert.deepStrictEqual(badged, []);
      assert.strictEqual(replaced, 0);
    } finally {
      restoreBrowser();
    }
  });
});
