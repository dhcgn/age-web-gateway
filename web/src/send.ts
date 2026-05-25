import { solvePoW, getSendDifficulty } from "./pow";
import { encryptBody, encryptFile } from "./encrypt";
import { getResolvedRecipients, ResolvedRecipient } from "./recipients";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type SendProgress =
  | {
      stage: "pow";
      difficulty: number;
      hashesChecked: number;
      expectedHashes: number;
      completionProbability: number;
      recipientIndex: number;
      recipientTotal: number;
      recipientAddress: string;
    }
  | {
      stage: "encrypting";
      current: number;
      total: number;
      recipientIndex: number;
      recipientTotal: number;
      recipientAddress: string;
    }
  | {
      stage: "uploading";
      recipientIndex: number;
      recipientTotal: number;
      recipientAddress: string;
    }
  | { stage: "done" }
  | { stage: "error"; message: string };

export interface RecipientSendResult {
  address: string;
  ok: boolean;
  error?: string;
}

async function sendForOneRecipient(
  recipient: ResolvedRecipient,
  bodyText: string,
  subject: string,
  files: File[],
  recipientIndex: number,
  recipientTotal: number,
  onProgress?: (p: SendProgress) => void
): Promise<void> {
  const keys = [recipient.selectedKey];

  // 1. Encrypt message body.
  if (onProgress) {
    onProgress({
      stage: "encrypting",
      current: 0,
      total: files.length + 1,
      recipientIndex,
      recipientTotal,
      recipientAddress: recipient.address,
    });
  }
  const messageEncrypted = await encryptBody(bodyText || "(empty)", keys);

  // 2. Encrypt files.
  const attachments: Array<{ payload: string; meta: string }> = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) {
      onProgress({
        stage: "encrypting",
        current: i + 1,
        total: files.length + 1,
        recipientIndex,
        recipientTotal,
        recipientAddress: recipient.address,
      });
    }
    const { payload, meta } = await encryptFile(files[i], keys);
    attachments.push({
      payload: uint8ToBase64(payload),
      meta: uint8ToBase64(meta),
    });
  }

  // 3. Solve PoW (fresh token per request).
  const difficulty = getSendDifficulty();
  if (onProgress) {
    onProgress({
      stage: "pow",
      difficulty,
      hashesChecked: 0,
      expectedHashes: Math.pow(2, Math.max(0, difficulty)),
      completionProbability: 0,
      recipientIndex,
      recipientTotal,
      recipientAddress: recipient.address,
    });
  }
  const powToken = await solvePoW(difficulty, (powProgress) => {
    if (onProgress) {
      onProgress({
        stage: "pow",
        difficulty: powProgress.difficulty,
        hashesChecked: powProgress.hashesChecked,
        expectedHashes: powProgress.expectedHashes,
        completionProbability: powProgress.completionProbability,
        recipientIndex,
        recipientTotal,
        recipientAddress: recipient.address,
      });
    }
  });

  // 4. POST one recipient at a time.
  if (onProgress) {
    onProgress({
      stage: "uploading",
      recipientIndex,
      recipientTotal,
      recipientAddress: recipient.address,
    });
  }
  const body = JSON.stringify({
    recipients: [recipient.address],
    subject: subject.trim() || undefined,
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
    const detail = Array.isArray(errData.errors) && errData.errors.length > 0
      ? errData.errors.join("; ")
      : errData.error || `Server returned ${resp.status}`;
    throw new Error(detail);
  }
}

export async function sendMessage(
  bodyText: string,
  subject: string,
  files: File[],
  onProgress?: (p: SendProgress) => void
): Promise<RecipientSendResult[]> {
  const recipients = getResolvedRecipients();

  if (recipients.length === 0) {
    throw new Error("No resolved recipients");
  }
  if (!bodyText.trim() && files.length === 0) {
    throw new Error("Nothing to send");
  }

  const results: RecipientSendResult[] = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      await sendForOneRecipient(
        r,
        bodyText,
        subject,
        files,
        i + 1,
        recipients.length,
        onProgress
      );
      results.push({ address: r.address, ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "send failed";
      results.push({ address: r.address, ok: false, error: message });
    }
  }

  if (onProgress) onProgress({ stage: "done" });
  return results;
}
