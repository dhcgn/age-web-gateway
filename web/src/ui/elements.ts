// Central DOM lookups for the single-page UI shell.
// These throw at load when an id is missing from index.html, same as before.
export const recipientsInput = document.getElementById("recipients-input") as HTMLInputElement;
export const recipientsList = document.getElementById("recipients-list") as HTMLDivElement;
export const trustWarning = document.getElementById("trust-warning") as HTMLDivElement;
export const trustWarningText = document.getElementById("trust-warning-text") as HTMLSpanElement;
export const bodyInput = document.getElementById("body-input") as HTMLTextAreaElement;
export const subjectInput = document.getElementById("subject-input") as HTMLInputElement;
export const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
export const fileInput = document.getElementById("file-input") as HTMLInputElement;
export const fileList = document.getElementById("file-list") as HTMLUListElement;
export const progressSection = document.getElementById("progress-section") as HTMLDivElement;
export const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
export const progressText = document.getElementById("progress-text") as HTMLSpanElement;
export const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
export const sizeWarning = document.getElementById("size-warning") as HTMLDivElement;
export const sizeWarningText = document.getElementById("size-warning-text") as HTMLSpanElement;
export const recentRecipientsBox = document.getElementById("recent-recipients") as HTMLDivElement;
export const recentRecipientsListEl = document.getElementById("recent-recipients-list") as HTMLDivElement;
export const recentRecipientsClearBtn = document.getElementById("recent-recipients-clear") as HTMLButtonElement;
export const statusDiv = document.getElementById("status") as HTMLDivElement;
export const copyUrlLink = document.getElementById("copy-url-link") as HTMLAnchorElement;

export const debugSection = document.getElementById("debug-section") as HTMLDivElement | null;
export const debugDifficultyInput = document.getElementById("debug-difficulty-input") as HTMLInputElement | null;
export const debugApplyDifficultyBtn = document.getElementById("debug-apply-difficulty") as HTMLButtonElement | null;
export const debugCurrentDifficulty = document.getElementById("debug-current-difficulty") as HTMLSpanElement | null;
export const debugTestPowBtn = document.getElementById("debug-test-pow") as HTMLButtonElement | null;
export const debugPowResult = document.getElementById("debug-pow-result") as HTMLPreElement | null;

export const privacyNotice = document.getElementById("privacy-notice") as HTMLElement | null;
export const privacyNoticeDismiss = document.getElementById("privacy-notice-dismiss") as HTMLButtonElement | null;
