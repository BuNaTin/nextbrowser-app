import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeError,
  installErrorReporting,
  recordUiAction,
  reportRendererError,
  resetErrorReportingForTests,
  setErrorReportingView,
  unexpectedErrorReference,
  type RendererErrorReport,
} from "./errorReporting";
import { trackEvent } from "./analytics";
import { errorReference } from "./userFacingError";

type Listener = (event: unknown) => void;

function fakeWindow() {
  const reports: RendererErrorReport[] = [];
  const crumbs: { category: string; message: string }[] = [];
  const listeners = new Map<string, Listener>();
  const page = {
    nextbrowser: {
      invoke: vi.fn(),
      on: vi.fn(),
      reportError: (report: RendererErrorReport) => { reports.push(report); },
      breadcrumb: (crumb: { category: string; message: string }) => { crumbs.push(crumb); },
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  return { page, reports, crumbs, listeners };
}

describe("renderer error reporting", () => {
  let env: ReturnType<typeof fakeWindow>;

  beforeEach(() => {
    resetErrorReportingForTests();
    env = fakeWindow();
    vi.stubGlobal("window", env.page);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends uncaught errors with the view, last action and the Ref the user sees", () => {
    setErrorReportingView("chat");
    recordUiAction("chat_request_submitted");
    const uninstall = installErrorReporting(env.page as unknown as Window);
    const error = new TypeError("Cannot read properties of undefined (reading 'map')");
    env.listeners.get("error")?.({ message: `Uncaught ${error.name}: ${error.message}`, error, filename: "file:///app/dist/assets/index.js", lineno: 10, colno: 4 });
    expect(env.reports).toHaveLength(1);
    const [report] = env.reports;
    expect(report).toMatchObject({
      kind: "exception",
      name: "TypeError",
      message: error.message,
      view: "chat",
      action: "chat_request_submitted",
      context: { ref: errorReference(`Uncaught ${error.name}: ${error.message}`), source_file: "file:///app/dist/assets/index.js", line: "10", column: "4" },
    });
    expect(report.stack).toContain("TypeError");
    expect(env.crumbs).toEqual([
      { category: "navigation", message: "chat" },
      { category: "ui", message: "chat_request_submitted" },
    ]);
    uninstall();
    expect(env.listeners.size).toBe(0);
  });

  it("reports unhandled rejections, but not background sync or layout noise", () => {
    installErrorReporting(env.page as unknown as Window);
    env.listeners.get("unhandledrejection")?.({ reason: new Error("Project sync failed (401).") });
    env.listeners.get("error")?.({ message: "ResizeObserver loop completed with undelivered notifications.", error: null });
    env.listeners.get("unhandledrejection")?.({ reason: new Error("socket closed") });
    expect(env.reports).toHaveLength(1);
    expect(env.reports[0]).toMatchObject({ kind: "unhandled_rejection", message: "socket closed", context: { ref: unexpectedErrorReference("socket closed") } });
  });

  it("never serializes non-Error values that may hold app data", () => {
    expect(describeError({ prompt: "secret prompt", token: "x" })).toEqual({ name: "NonError", message: "Thrown [object Object]" });
    expect(describeError({ message: "plain object failure", data: "secret" })).toEqual({ name: "NonErrorObject", message: "plain object failure" });
    expect(describeError("text")).toEqual({ name: "Error", message: "text" });
  });

  it("only accepts identifiers as views and UI actions", () => {
    setErrorReportingView("chat with free text");
    recordUiAction("user typed this");
    expect(env.crumbs).toEqual([]);
  });

  it("uses analytics event names as UI breadcrumbs", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("document", { createElement: () => ({}), head: { appendChild: () => undefined } });
    Object.assign(env.page, { setTimeout: () => 0 });
    trackEvent("profile_start_requested", { profile_count: 2 });
    trackEvent("screen_view", { screen_name: "chat" });
    expect(env.crumbs).toEqual([{ category: "ui", message: "profile_start_requested" }]);
  });

  it("rate-limits a renderer error loop", () => {
    for (let index = 0; index < 100; index += 1) reportRendererError("exception", new Error(`loop ${index}`));
    expect(env.reports).toHaveLength(30);
  });

  it("is a no-op without the bridge and never throws", () => {
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    expect(reportRendererError("exception", new Error("x"))).toBe(false);
    vi.stubGlobal("window", { nextbrowser: { reportError: () => { throw new Error("ipc down"); } } });
    expect(reportRendererError("exception", new Error("x"))).toBe(false);
  });
});
