import { Encrypter } from "age-encryption";

/**
 * Encrypt a text message body to one or more age recipients.
 * Returns the raw ciphertext bytes (message.age).
 */
export async function encryptBody(
  text: string,
  recipientKeys: string[]
): Promise<Uint8Array> {
  const e = new Encrypter();
  for (const key of recipientKeys) {
    e.addRecipient(key);
  }
  const encoded = new TextEncoder().encode(text);
  return e.encrypt(encoded);
}

/**
 * Encrypt a file's bytes and its metadata separately.
 * Returns both encrypted blobs.
 */
export async function encryptFile(
  file: File,
  recipientKeys: string[]
): Promise<{ payload: Uint8Array; meta: Uint8Array }> {
  // Read file bytes.
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  // Compute SHA-256 of the file.
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBytes);
  const hashArray = new Uint8Array(hashBuffer);
  const sha256 = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Metadata JSON.
  const metadata = JSON.stringify({
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    sha256: sha256,
  });

  // Encrypt payload.
  const pe = new Encrypter();
  for (const key of recipientKeys) {
    pe.addRecipient(key);
  }
  const payload = await pe.encrypt(fileBytes);

  // Encrypt metadata.
  const me = new Encrypter();
  for (const key of recipientKeys) {
    me.addRecipient(key);
  }
  const meta = await me.encrypt(new TextEncoder().encode(metadata));

  return { payload, meta };
}
