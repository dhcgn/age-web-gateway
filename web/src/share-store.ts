// Handoff for files shared from Android via the service worker share target.
// Blobs cannot cross the worker/page boundary through navigation, so the
// worker stashes the payload in IndexedDB and the app picks it up on ?share=1.
// Uses only the indexedDB API so it runs in both page and worker contexts.

export interface SharedFile {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

export interface SharedPayload {
  files: SharedFile[];
  subject: string;
  body: string;
}

const DB_NAME = "agemail-share";
const STORE = "files";
const KEY = "pending";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | null = null;
    openDB().then(
      (opened) => {
        db = opened;
        const tx = db.transaction(STORE, mode);
        tx.oncomplete = () => db?.close();
        tx.onerror = () => reject(tx.error);
        const req = op(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      },
      reject
    );
  });
}

export function putSharedPayload(payload: SharedPayload): Promise<void> {
  return run<void>("readwrite", (store) => store.put(payload, KEY)).then(() => undefined);
}

export async function takeSharedPayload(): Promise<SharedPayload | null> {
  const payload = await run<SharedPayload | undefined>("readwrite", (store) => {
    const req = store.get(KEY);
    // Single trip: read and clear in the same transaction.
    store.delete(KEY);
    return req;
  });
  return payload ?? null;
}
