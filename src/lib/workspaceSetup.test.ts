import { afterEach, describe, expect, it, vi } from "vitest";
import { requiresWorkspaceSetup } from "./workspaceSetup";
import type { Conversation, Workspace } from "../types";

describe("workspace setup gate", () => {
  it("cannot be bypassed by stale local onboarding state", () => {
    expect(requiresWorkspaceSetup([], [])).toBe(true);
  });

  it("is dismissed once an account has a workspace", () => {
    const workspace = {
      id: "workspace-1",
      name: "Research",
      profileNames: ["browser"],
      profileToolsets: {},
      createdAt: 1,
      updatedAt: 1,
    } satisfies Workspace;
    const conversation = {
      id: "chat-1",
      title: "Research",
      agent: "codex",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      workspaceId: workspace.id,
    } satisfies Conversation;
    expect(requiresWorkspaceSetup([workspace], [conversation], workspace.id)).toBe(false);
  });

  it("allows an intentionally empty workspace", () => {
    const workspace = {
      id: "workspace-1", name: "Research", profileNames: [], profileToolsets: {}, createdAt: 1, updatedAt: 1,
    } satisfies Workspace;
    expect(requiresWorkspaceSetup([workspace], [], workspace.id)).toBe(false);
  });

  it("does not recreate a deleted last profile", () => {
    const workspace = {
      id: "workspace-1", name: "Research", profileNames: [], profileToolsets: {}, createdAt: 1, updatedAt: 1,
    } satisfies Workspace;
    const conversation = {
      id: "chat-1", title: "Research", agent: "codex", messages: [], createdAt: 1, updatedAt: 1,
      workspaceId: workspace.id,
    } satisfies Conversation;
    expect(requiresWorkspaceSetup([workspace], [conversation], workspace.id)).toBe(false);
  });

  describe("after the account has owned a workspace", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("does not recreate defaults when the last workspace is deleted", () => {
      const storage = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });
      const workspace = {
        id: "workspace-1", name: "Research", profileNames: [], profileToolsets: {}, createdAt: 1, updatedAt: 1,
      } satisfies Workspace;
      expect(requiresWorkspaceSetup([workspace], [], workspace.id, "owner-a")).toBe(false);
      expect(requiresWorkspaceSetup([], [], undefined, "owner-a")).toBe(false);
      // Another account on the same machine is still new.
      expect(requiresWorkspaceSetup([], [], undefined, "owner-b")).toBe(true);
    });
  });
});
