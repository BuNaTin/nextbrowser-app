import { userFacingBrowserError } from "./userFacingBrowserError";

const errorCodePattern = /^[A-Z][A-Z0-9_]{2,63}$/;

export function errorReference(value: string): string {
  let hash = 2166136261;
  for (const char of value || "INTERNAL_ERROR") {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `NB-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function internalError(action: string, code: string): string {
  const context = action.trim() || "The action failed.";
  const safeCode = errorCodePattern.test(code) ? code : "INTERNAL_ERROR";
  return `${context} Ref: ${errorReference(safeCode)}`;
}

/**
 * Cloud project sync is best-effort. Its authentication failures are not app
 * errors: they neither cover the active chat nor become error reports.
 */
export function isBackgroundSyncFailure(detail: string): boolean {
  return /project sync failed\s*\(\d+\)|unauthorized.*project/i.test(detail);
}

export function needsSupportLink(message: string): boolean {
  return /\bRef: NB-[A-F0-9]{8}\b/.test(message);
}

/**
 * A failed action must stay diagnosable: the reference maps back to the error
 * code, and the sanitized reason tells the user what actually failed instead of
 * leaving them with a hash alone.
 */
export function actionFailureMessage(action: string, code: string, detail?: unknown): string {
  const context = action.trim() || "The action failed.";
  const safeCode = errorCodePattern.test(code) ? code : "INTERNAL_ERROR";
  const reason = (detail instanceof Error ? detail.message : typeof detail === "string" ? detail : "").trim();
  return `${context}${reason ? ` ${userFacingBrowserError(reason)}` : ""} Ref: ${errorReference(safeCode)}`;
}
