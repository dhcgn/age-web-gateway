// Service worker: handles the Web Share Target POST only (no offline caching).
// Registered with scope "/" so it sees share intents to /share-target.
// DOM lib has no worker types, so the scope surface is declared structurally.

import { putSharedPayload } from "./share-store";

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface WorkerScopeLike {
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: string, listener: (event: FetchEventLike) => void): void;
}

declare const self: WorkerScopeLike;

const SHARE_PATH = "/share-target";
const FILES_FIELD = "attachments";

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  let url: URL;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (event.request.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const files = form
      .getAll(FILES_FIELD)
      .filter((v): v is File => v instanceof File && v.size > 0);
    const title = form.get("title");
    const text = form.get("text");
    await putSharedPayload({
      files: files.map((f) => ({
        name: f.name,
        type: f.type,
        lastModified: f.lastModified,
        blob: f,
      })),
      subject: typeof title === "string" ? title : "",
      body: typeof text === "string" ? text : "",
    });
  } catch {
    // Fall through to the app; it starts with a clean form.
  }
  return Response.redirect("/?share=1", 303);
}
