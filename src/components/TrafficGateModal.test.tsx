import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProxyTraffic } from "../types";
import { TrafficGateModal } from "./TrafficGateModal";

const state = vi.hoisted(() => ({
  proxy: undefined as ProxyTraffic | undefined,
  trafficGatePromptOpen: false,
  setTrafficGatePromptOpen: vi.fn(),
}));

vi.mock("../store", () => ({
  useStore: (select: (value: typeof state) => unknown) => select(state),
}));

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

function proxy(overrides: Partial<ProxyTraffic>): ProxyTraffic {
  return {
    limited: true,
    used_bytes: 0,
    state: "ok",
    ...overrides,
  } as ProxyTraffic;
}

const mebibyte = 1024 * 1024;

beforeEach(() => {
  state.proxy = undefined;
  state.trafficGatePromptOpen = false;
  state.setTrafficGatePromptOpen.mockReset();
});

describe("free traffic gate prompt", () => {
  it("asks a gated account to star the repo once it runs out, Discord for questions", () => {
    state.trafficGatePromptOpen = true;
    state.proxy = proxy({
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    });

    const html = renderToStaticMarkup(<TrafficGateModal />);

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Get 1 GB of free proxy traffic");
    expect(html).toContain("nextbrowser-oss/nextbrowser-app");
    expect(html).toContain("Open GitHub");
    expect(html).toContain("Questions? Ask in Discord");
    expect(html).toContain("141 MiB used");
  });

  it("stays down for a gated account that still has traffic", () => {
    state.trafficGatePromptOpen = true;
    state.proxy = proxy({
      used_bytes: 12 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 129 * mebibyte,
    });

    expect(renderToStaticMarkup(<TrafficGateModal />)).toBe("");
  });

  it("stays down for an account holding the full allowance", () => {
    state.trafficGatePromptOpen = true;
    state.proxy = proxy({
      used_bytes: 1024 * mebibyte,
      limit_bytes: 1024 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    });

    expect(renderToStaticMarkup(<TrafficGateModal />)).toBe("");
  });

  it("renders nothing while the prompt is closed", () => {
    state.proxy = proxy({
      used_bytes: 141 * mebibyte,
      limit_bytes: 141 * mebibyte,
      remaining_bytes: 0,
      state: "exhausted",
    });

    expect(renderToStaticMarkup(<TrafficGateModal />)).toBe("");
  });
});
