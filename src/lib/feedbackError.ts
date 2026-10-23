const IPC_PREFIX = /^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/i;
// The feedback request goes through the shared backend client, which words
// every failed status as a project sync failure.
const BACKEND_STATUS = /^Project sync failed \((\d{3})\)/;
const FALLBACK = "We couldn't send your feedback. Please try again.";

/** The sentence the feedback form shows for a failed send. */
export function feedbackErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const message = raw.replace(IPC_PREFIX, "").trim();
  const status = message.match(BACKEND_STATUS)?.[1];
  if (status) {
    return Number(status) >= 500
      ? "The feedback service is not responding right now. Please try again in a few minutes."
      : FALLBACK;
  }
  return message || FALLBACK;
}
