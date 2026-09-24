// "Download record" feature: human-readable summary of a sent message.
// buildRecordText is pure logic (unit-tested); the rest needs statusDiv.
import type { RecipientSendResult } from "../send.ts";
import { statusDiv } from "./elements.ts";

export interface SendSnapshot {
  date: Date;
  results: RecipientSendResult[];
  subject: string;
  body: string;
  files: Array<{ name: string; size: number; type: string }>;
}

export function buildRecordText(s: SendSnapshot): string {
  const lines: string[] = [];
  lines.push("agemail — send record");
  lines.push(`Date: ${s.date.toISOString()}`);
  lines.push("");
  lines.push(`Recipients (${s.results.length}):`);
  for (const r of s.results) {
    const status = r.ok ? "OK" : `FAILED: ${r.error ?? "unknown"}`;
    lines.push(`  - ${r.address}  [${status}]`);
  }
  lines.push("");
  lines.push(`Subject (not encrypted): ${s.subject || "(none)"}`);
  lines.push("");
  lines.push("Message:");
  lines.push(s.body || "(empty)");
  lines.push("");
  if (s.files.length > 0) {
    lines.push(`Attachments (${s.files.length}):`);
    for (const f of s.files) {
      const kb = (f.size / 1024).toFixed(1);
      lines.push(`  - ${f.name}  (${kb} KB, ${f.type || "unknown type"})`);
    }
  } else {
    lines.push("Attachments: none");
  }
  lines.push("");
  lines.push("Note: this record is for your reference. The message itself was end-to-end");
  lines.push("encrypted with age and is not stored anywhere outside the recipients' mailboxes.");
  return lines.join("\n");
}

function downloadRecord(s: SendSnapshot): void {
  const text = buildRecordText(s);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = s.date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `agemail-record-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function appendRecordDownloadButton(s: SendSnapshot): void {
  const wrap = document.createElement("div");
  wrap.className = "record-download";

  const note = document.createElement("span");
  note.className = "record-download-note";
  note.textContent = "Want a local copy of what you sent?";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "record-download-btn";
  btn.textContent = "Download record";
  btn.addEventListener("click", () => downloadRecord(s));

  wrap.appendChild(note);
  wrap.appendChild(btn);
  statusDiv.appendChild(wrap);
}
