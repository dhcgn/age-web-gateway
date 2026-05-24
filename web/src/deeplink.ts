import { debouncedLookup } from "./recipients";

/**
 * Parse the URL fragment for deep-link prefill.
 * Supported: #to=user@domain.de,ops@example.org&body=Hello%20there
 */
export function parseDeepLink(): { to: string[]; body: string } {
  const hash = window.location.hash.slice(1); // remove '#'
  if (!hash) return { to: [], body: "" };

  const params = new URLSearchParams(hash);
  const to = params.get("to");
  const body = params.get("body");

  return {
    to: to ? to.split(",").map((s) => s.trim()).filter(Boolean) : [],
    body: body || "",
  };
}

export function applyDeepLink(
  recipientsInput: HTMLInputElement,
  bodyInput: HTMLTextAreaElement,
  addRecipientBadge: (address: string) => void
): void {
  const { to, body } = parseDeepLink();

  if (body) {
    bodyInput.value = body;
  }

  for (const addr of to) {
    addRecipientBadge(addr);
    debouncedLookup(addr, undefined, 0);
  }

  // Strip the fragment from the visible URL.
  if (to.length > 0 || body) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
