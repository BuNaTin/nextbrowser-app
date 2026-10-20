import { errorReference, isBackgroundSyncFailure } from "./userFacingError";

// Renderer half of client error reporting. Errors and breadcrumbs go to the
// main process over the preload bridge; the main process scrubs, folds,
// queues and sends them (electron/client-error-reporter.cjs). Nothing here
// may throw: a broken reporter must not become another app error.

export type RendererErrorKind = "exception" | "unhandled_rejection" | "react_render";

export interface RendererErrorReport {
  kind: RendererErrorKind;
  name: string;
  message: string;
  stack?: string;
  view?: string;
  action?: string;
  context?: Record<string, string>;
}

// Views and UI actions are code identifiers, never user text.
const IDENTIFIER = /^[A-Za-z0-9_.:/-]{1,100}$/;
const RATE_WINDOW_MS = 60_000;
const MAX_REPORTS_PER_WINDOW = 30;
// Chromium raises this for a layout that settles over two frames; it is not a
// failure anyone can act on.
const IGNORED_MESSAGES = /ResizeObserver loop/i;

let currentView = "";
let lastAction = "";
let windowStartedAt = 0;
let reportsInWindow = 0;

function bridge() {
  return typeof window === "undefined" ? undefined : window.nextbrowser;
}

export function setErrorReportingView(view: string): void {
  if (!IDENTIFIER.test(view) || view === currentView) return;
  currentView = view;
  try {
    bridge()?.breadcrumb?.({ category: "navigation", message: view });
  } catch {
    // Breadcrumbs are context only.
  }
}

/** Records a named UI action (the analytics event name) as a breadcrumb. */
export function recordUiAction(name: string): void {
  if (!IDENTIFIER.test(name)) return;
  lastAction = name;
  try {
    bridge()?.breadcrumb?.({ category: "ui", message: name });
  } catch {
    // Breadcrumbs are context only.
  }
}

export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || String(error), ...(error.stack ? { stack: error.stack } : {}) };
  }
  if (typeof error === "string") return { name: "Error", message: error };
  // Other thrown values can hold app data, so only a message string or the
  // value's type is reported.
  const message = error && typeof error === "object" ? (error as { message?: unknown }).message : undefined;
  if (typeof message === "string" && message) return { name: "NonErrorObject", message };
  return { name: "NonError", message: `Thrown ${Object.prototype.toString.call(error)}` };
}

/** The text the app's "Unexpected app error" notice is keyed on. */
export function unexpectedErrorDetail(event: ErrorEvent | PromiseRejectionEvent): string {
  if ("reason" in event) {
    const reason = event.reason;
    return reason instanceof Error ? reason.message : String(reason ?? "");
  }
  return event.message;
}

/** The Ref shown with the "Unexpected app error" notice for the same failure. */
export function unexpectedErrorReference(detail: string): string {
  return errorReference(detail.trim() || "Unknown renderer error");
}

export function reportRendererError(
  kind: RendererErrorKind,
  error: unknown,
  context: Record<string, string> = {},
  componentStack?: string | null,
): boolean {
  try {
    const target = bridge();
    if (!target?.reportError) return false;
    const now = Date.now();
    if (now - windowStartedAt > RATE_WINDOW_MS) {
      windowStartedAt = now;
      reportsInWindow = 0;
    }
    if (reportsInWindow >= MAX_REPORTS_PER_WINDOW) return false;
    reportsInWindow += 1;
    const described = describeError(error);
    const stack = [described.stack, componentStack ? `Component stack:${componentStack}` : ""].filter(Boolean).join("\n\n");
    const report: RendererErrorReport = {
      kind,
      name: described.name,
      message: described.message,
      ...(stack ? { stack } : {}),
      ...(currentView ? { view: currentView } : {}),
      ...(lastAction ? { action: lastAction } : {}),
      context,
    };
    target.reportError(report);
    return true;
  } catch {
    return false;
  }
}

/** Reports uncaught renderer errors and unhandled promise rejections. */
export function installErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    const detail = unexpectedErrorDetail(event);
    if (IGNORED_MESSAGES.test(detail) || isBackgroundSyncFailure(detail)) return;
    reportRendererError("exception", event.error ?? event.message, {
      ref: unexpectedErrorReference(detail),
      ...(event.filename ? { source_file: event.filename, line: String(event.lineno || 0), column: String(event.colno || 0) } : {}),
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const detail = unexpectedErrorDetail(event);
    // Background project sync failures are already handled (and their 5xx
    // reported with a trace id by the main process).
    if (isBackgroundSyncFailure(detail)) return;
    reportRendererError("unhandled_rejection", event.reason, { ref: unexpectedErrorReference(detail) });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Test hook: forget the view, last action and rate window. */
export function resetErrorReportingForTests(): void {
  currentView = "";
  lastAction = "";
  windowStartedAt = 0;
  reportsInWindow = 0;
}
