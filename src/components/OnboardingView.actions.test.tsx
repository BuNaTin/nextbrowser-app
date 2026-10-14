import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The tests run without a DOM, so call the component as a function with inert
// hooks and press its buttons through their props.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback: <T,>(callback: T) => callback,
  useEffect: () => undefined,
  useRef: <T,>(value: T) => ({ current: value }),
  useState: <T,>(value: T) => [value, () => undefined],
}));

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

const { state } = vi.hoisted(() => ({
  state: {
    finishOnboarding: vi.fn(),
    authorizeAgent: vi.fn(),
    loginAgent: vi.fn(),
    setTab: vi.fn(),
    setTerminalChat: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    agentId: "claude",
    switchAgent: vi.fn(),
    agentReady: () => true,
    agentVersion: () => "2.1.86",
    agentLoggedIn: () => true,
    agentError: () => undefined,
    runtime: { claude: { authorizing: false } },
    authed: true,
    profiles: [] as Array<{ name: string }>,
    workspaces: [] as Array<{ id: string; profileNames: string[] }>,
    activeWorkspaceId: "workspace",
    statuses: {} as Record<string, string>,
    selectedProfile: undefined as string | undefined,
    setDashboardKeyPromptOpen: vi.fn(),
    onboardingStepIndex: 4,
    setOnboardingStepIndex: vi.fn(),
    suspendOnboardingForSetup: vi.fn(),
    onboardingSetupError: undefined as string | undefined,
  },
}));

vi.mock("../store", () => ({
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import { OnboardingView } from "./OnboardingView";

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
}

function button(node: ReactNode, label: string): { onClick: () => void; disabled?: boolean } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick: () => void; disabled?: boolean }>(child)) continue;
    if (child.type === "button" && text(child.props.children).trim() === label) return child.props;
    const match = button(child.props.children, label);
    if (match) return match;
  }
}

function press(label: string) {
  const target = button(OnboardingView(), label);
  expect(target, `button "${label}"`).toBeDefined();
  target!.onClick();
}

const dispatched = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; },
    dispatchEvent: (event: Event) => { dispatched(event.type); return true; },
  });
  state.onboardingStepIndex = 4;
  state.profiles = [{ name: "work" }];
  state.workspaces = [{ id: "workspace", profileNames: ["work"] }];
  state.selectedProfile = "work";
  state.statuses = { work: "stopped" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Live step profile start", () => {
  it("steps the tour aside before the sidebar starts the profile", () => {
    press("Start profile");

    expect(state.suspendOnboardingForSetup).toHaveBeenCalledOnce();
    expect(state.setSidebarCollapsed).toHaveBeenCalledWith(false);
    expect(dispatched).toHaveBeenCalledExactlyOnceWith("nextbrowser:start-selected-profile");
    // Suspending first keeps the download prompt and start errors from opening
    // under the tour.
    expect(state.suspendOnboardingForSetup.mock.invocationCallOrder[0])
      .toBeLessThan(dispatched.mock.invocationCallOrder[0]);
  });

  it("opens the profile creator when the workspace has no profile", () => {
    state.profiles = [];
    state.workspaces = [{ id: "workspace", profileNames: [] }];
    state.selectedProfile = undefined;

    press("Set up profile");

    expect(state.suspendOnboardingForSetup).toHaveBeenCalledOnce();
    expect(dispatched).toHaveBeenCalledExactlyOnceWith("nextbrowser:open-profile-creator");
  });
});
