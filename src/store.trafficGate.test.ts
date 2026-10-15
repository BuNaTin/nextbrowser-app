import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("./electronBridge", () => ({
  invoke: bridge.invoke,
  listen: bridge.listen,
  filePathForFile: () => "",
}));

vi.mock("./lib/analytics", () => ({
  setAnalyticsUserId: vi.fn(),
  trackEvent: vi.fn(),
  trackScreenView: vi.fn(),
  trackTiming: vi.fn(),
}));

const preflight = vi.hoisted(() => ({ prepareSession: vi.fn() }));
vi.mock("./preflight", () => ({ prepareSession: preflight.prepareSession, tidyEngineTabs: vi.fn() }));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

const mebibyte = 1024 * 1024;

/** The allocation `nbc proxy-traffic` reports next. */
let traffic: Record<string, unknown> = {};

function mockDesktop() {
  bridge.listen.mockResolvedValue(() => {});
  bridge.invoke.mockImplementation(async (command: string, payload?: { args?: string[] }) => {
    switch (command) {
      case "app_data_read": return null;
      case "app_data_write": return undefined;
      case "nextctl_run": {
        const args = payload?.args ?? [];
        if (args[0] === "proxy-traffic") {
          return {
            stdout: JSON.stringify({ ok: true, data: { proxy_traffic: traffic } }),
            stderr: "",
            code: 0,
          };
        }
        return { stdout: "", stderr: "", code: 0 };
      }
      default: return undefined;
    }
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  bridge.invoke.mockReset();
  bridge.listen.mockReset();
  mockDesktop();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("free traffic gate prompt", () => {
  it("raises the prompt the first time a gated allocation runs out", async () => {
    const { useStore } = await import("./store");

    traffic = {
      limited: true,
      used_bytes: 60 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 81 * mebibyte,
      state: "ok",
    };
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(false);

    traffic = {
      limited: true,
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(true);
  });

  it("does not raise it again on the next refresh once dismissed", async () => {
    const { useStore } = await import("./store");
    traffic = {
      limited: true,
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };

    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(true);

    useStore.getState().setTrafficGatePromptOpen(false);
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(false);
  });

  it("raises it again after a grant is spent a second time", async () => {
    const { useStore } = await import("./store");
    traffic = {
      limited: true,
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };
    await useStore.getState().loadProxy();
    useStore.getState().setTrafficGatePromptOpen(false);

    // An admin unlocks the account by hand.
    traffic = {
      limited: true,
      used_bytes: 141 * mebibyte,
      limit_bytes: 1024 * mebibyte,
      remaining_bytes: 883 * mebibyte,
      state: "ok",
    };
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(false);

    // A second gated allocation runs out later.
    traffic = {
      limited: true,
      used_bytes: 200 * mebibyte,
      limit_bytes: 200 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(true);
  });

  it("interrupts once per start, not again when a launch is refused after Later", async () => {
    const { useStore } = await import("./store");
    const proxyReads = () => bridge.invoke.mock.calls.filter(([, payload]) => payload?.args?.[0] === "proxy-traffic").length;
    traffic = {
      limited: true,
      used_bytes: 134 * mebibyte,
      limit_bytes: 134 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };

    // The startup refresh finds the gate closed and raises the prompt.
    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(true);
    useStore.getState().setTrafficGatePromptOpen(false);

    // nextctl then refuses a profile for the same pause.
    preflight.prepareSession.mockRejectedValue(new Error("[PROXY_TRAFFIC_EXHAUSTED] Traffic exhausted"));
    await expect(useStore.getState().startProfile("qa")).rejects.toThrow("PROXY_TRAFFIC_EXHAUSTED");
    await vi.waitFor(() => expect(proxyReads()).toBe(2));
    await vi.waitFor(() => expect(useStore.getState().isRefreshing).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useStore.getState().trafficGatePromptOpen).toBe(false);
  });

  it("does not take an unreadable allocation for the gate opening", async () => {
    const { useStore } = await import("./store");
    const closed = {
      limited: true,
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };
    traffic = closed;
    await useStore.getState().loadProxy();
    useStore.getState().setTrafficGatePromptOpen(false);

    traffic = { limited: true, used_bytes: 141 * mebibyte, limit_bytes: null, state: "exhausted" };
    await useStore.getState().loadProxy();
    traffic = closed;
    await useStore.getState().loadProxy();

    expect(useStore.getState().trafficGatePromptOpen).toBe(false);
  });

  it("leaves an account with the full free allowance alone", async () => {
    const { useStore } = await import("./store");
    traffic = {
      limited: true,
      used_bytes: 1024 * mebibyte,
      limit_bytes: 1024 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    };

    await useStore.getState().loadProxy();
    expect(useStore.getState().trafficGatePromptOpen).toBe(false);
  });
});
