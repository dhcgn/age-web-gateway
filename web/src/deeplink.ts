import { debouncedLookup } from "./recipients";

/**
 * Parse the URL fragment for deep-link prefill.
 * Supported: #to=user@domain.de,ops@example.org&body=Hello%20there&subject=Hello
 */
export function parseDeepLink(): { to: string[]; body: string; subject: string } {
  const hash = window.location.hash.slice(1); // remove '#'
  if (!hash) return { to: [], body: "", subject: "" };

  const params = new URLSearchParams(hash);
  const to = params.get("to");
  const body = params.get("body");
  const subject = params.get("subject");

  return {
    to: to ? to.split(",").map((s) => s.trim()).filter(Boolean) : [],
    body: body || "",
    subject: subject || "",
  };
}

export function applyDeepLink(
  recipientsInput: HTMLInputElement,
  bodyInput: HTMLTextAreaElement,
  subjectInput: HTMLInputElement,
  addRecipientBadge: (address: string) => void
): void {
  const { to, body, subject } = parseDeepLink();

  if (body) {
    bodyInput.value = body;
  }

  if (subject) {
    subjectInput.value = subject;
  }

  for (const addr of to) {
    addRecipientBadge(addr);
    debouncedLookup(addr, undefined, 0);
  }

  // Strip the fragment from the visible URL.
  if (to.length > 0 || body || subject) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
