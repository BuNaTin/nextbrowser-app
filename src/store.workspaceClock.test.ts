import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { moveProfileToWorkspace } from "./lib/workspaceProfiles";
import type { Workspace } from "./types";

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("./electronBridge", () => ({ ...bridge, filePathForFile: () => "" }));
vi.mock("./lib/analytics", () => ({ setAnalyticsUserId: vi.fn(), trackEvent: vi.fn(), trackScreenView: vi.fn(), trackTiming: vi.fn() }));

// The cloud copy was stamped by a server clock one hour ahead of this device.
const serverStamp = Date.parse("2026-10-13T12:00:00Z");
const clientNow = serverStamp - 60 * 60 * 1000;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ now: clientNow, toFake: ["Date"] });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  bridge.invoke.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("uploads a new profile assignment even when the local clock lags the server", async () => {
  const { useStore } = await import("./store");
  const cloud = {
    id: "w1", name: "Main", revision: 3, created_at: new Date(serverStamp).toISOString(), updated_at: new Date(serverStamp).toISOString(),
    document: { profileNames: [], profileToolsets: {}, profileProxyIds: {} },
  };
  const puts: Array<{ profileNames: string[] }> = [];
  bridge.invoke.mockImplementation(async (command: string, args: { workspace?: { document: { profileNames: string[] } } }) => {
    if (command === "workspaces_list") return { workspaces: [cloud] };
    if (command === "workspace_put") { puts.push(args.workspace!.document); return { revision: 4 }; }
    if (command === "projects_list") return { projects: [] };
    return { revision: 1 };
  });
  useStore.setState({
    authed: true, projectsSyncing: false, conversations: [],
    workspaces: [{ id: "w1", name: "Main", profileNames: [], profileToolsets: {}, profileProxyIds: {}, createdAt: serverStamp, updatedAt: serverStamp }],
    workspaceRevisions: { w1: 3 }, activeWorkspaceId: "w1",
  });

  await useStore.getState().assignProfileToProject("US profile", "clawbrowser", "w1");

  expect(puts.at(-1)?.profileNames).toEqual(["US profile"]);
  expect(useStore.getState().workspaces[0].profileNames).toEqual(["US profile"]);
});

it("moves a profile with timestamps newer than both synced workspaces", () => {
  const workspaces: Workspace[] = [
    { id: "a", name: "A", profileNames: ["p"], profileToolsets: { p: "clawbrowser" }, createdAt: 1, updatedAt: serverStamp },
    { id: "b", name: "B", profileNames: [], profileToolsets: {}, createdAt: 1, updatedAt: serverStamp },
  ];
  const moved = moveProfileToWorkspace(workspaces, "p", "b", clientNow);
  expect(moved.every((workspace) => workspace.updatedAt > serverStamp)).toBe(true);
});
