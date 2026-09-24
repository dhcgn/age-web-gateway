// Consumes files/text shared from Android via the service worker share target
// (stashed in IndexedDB, signalled by ?share=1). Shell-owned state and
// refresh arrive via deps so this module stays decoupled from main.ts.
import { takeSharedPayload } from "../share-store.ts";
import { subjectInput, bodyInput } from "./elements.ts";

export interface ShareIntakeDeps {
  addFiles(files: File[]): void;
  refresh(): void;
}

export async function consumeSharedPayload(deps: ShareIntakeDeps): Promise<void> {
  if (!new URLSearchParams(location.search).has("share")) {
    return;
  }
  history.replaceState(null, "", location.pathname);
  try {
    const payload = await takeSharedPayload();
    if (!payload) {
      return;
    }
    if (payload.subject && !subjectInput.value) {
      subjectInput.value = payload.subject;
    }
    if (payload.body && !bodyInput.value) {
      bodyInput.value = payload.body;
    }
    if (payload.files.length > 0) {
      deps.addFiles(
        payload.files.map(
          (f) => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified })
        )
      );
    } else {
      deps.refresh();
    }
  } catch {
    // Corrupt handoff store; start with a clean form.
  }
}
