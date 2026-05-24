import { solvePoW, getDifficulty } from "./pow";
import { encryptBody, encryptFile } from "./encrypt";
import { getAllKeys, getResolvedRecipients } from "./recipients";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type SendProgress =
  | { stage: "pow"; hashesChecked?: number }
  | { stage: "encrypting"; current: number; total: number }
  | { stage: "uploading" }
  | { stage: "done" }
  | { stage: "error"; message: string };

export async function sendMessage(
  bodyText: string,
  files: File[],
  onProgress?: (p: SendProgress) => void
): Promise<void> {
  const recipients = getResolvedRecipients();
  const allKeys = getAllKeys();

  if (recipients.length === 0) {
    throw new Error("No resolved recipients");
  }
  if (allKeys.length === 0) {
    throw new Error("No encryption keys available");
  }
  if (!bodyText.trim() && files.length === 0) {
    throw new Error("Nothing to send");
  }

  // 1. Encrypt message body.
  if (onProgress) onProgress({ stage: "encrypting", current: 0, total: files.length + 1 });
  const messageEncrypted = await encryptBody(bodyText || "(empty)", allKeys);

  // 2. Encrypt files.
  const attachments: Array<{ payload: string; meta: string }> = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress({ stage: "encrypting", current: i + 1, total: files.length + 1 });
    const { payload, meta } = await encryptFile(files[i], allKeys);
    attachments.push({
      payload: uint8ToBase64(payload),
      meta: uint8ToBase64(meta),
    });
  }

  // 3. Solve PoW.
  if (onProgress) onProgress({ stage: "pow" });
  const difficulty = getDifficulty();
  const powToken = await solvePoW(difficulty, (h) => {
    if (onProgress) onProgress({ stage: "pow", hashesChecked: h });
  });

  // 4. POST to /api/send.
  if (onProgress) onProgress({ stage: "uploading" });
  const body = JSON.stringify({
    recipients: recipients.map((r) => r.address),
    message: uint8ToBase64(messageEncrypted),
    attachments,
  });

  const resp = await fetch("/api/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PoW": powToken,
    },
    body,
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({ error: "Send failed" }));
    throw new Error(errData.error || `Server returned ${resp.status}`);
  }

  if (onProgress) onProgress({ stage: "done" });
}
