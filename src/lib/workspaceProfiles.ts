import type { Workspace } from "../types";

export function moveProfileToWorkspace(
  workspaces: Workspace[],
  profileName: string,
  targetWorkspaceId: string,
  updatedAt: number,
): Workspace[] {
  const source = workspaces.find((workspace) => workspace.profileNames.includes(profileName));
  const target = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
  if (!source) throw new Error("Profile is not assigned to a workspace.");
  if (!target) throw new Error("Workspace not found.");
  if (source.id === target.id) return workspaces;
  const toolset = source.profileToolsets[profileName] ?? "clawbrowser";
  const proxyId = source.profileProxyIds?.[profileName];

  return workspaces.map((workspace) => {
    if (workspace.id !== source.id && workspace.id !== target.id) return workspace;
    const profileNames = workspace.profileNames.filter((name) => name !== profileName);
    const profileToolsets = { ...workspace.profileToolsets };
    const profileProxyIds = { ...(workspace.profileProxyIds ?? {}) };
    delete profileToolsets[profileName];
    delete profileProxyIds[profileName];
    if (workspace.id === target.id) {
      profileNames.push(profileName);
      profileToolsets[profileName] = toolset;
      if (proxyId) profileProxyIds[profileName] = proxyId;
    }
    // Keep the edit newer than the synced copy even when the local clock is
    // behind the server clock that stamped it.
    return { ...workspace, profileNames, profileToolsets, profileProxyIds, updatedAt: Math.max(updatedAt, workspace.updatedAt + 1) };
  });
}

/**
 * The profiles a workspace lists, counted the way the sidebar counts them: its
 * assigned profiles that still exist in the browser inventory, plus the
 * Multilogin profile picked for it. Other workspaces' profiles are not its own.
 */
export function countWorkspaceProfiles(
  workspace: Pick<Workspace, "profileNames"> | undefined,
  inventory: ReadonlyArray<{ name: string }>,
  hasMultiloginProfile: boolean,
): number {
  const existing = new Set(inventory.map((profile) => profile.name));
  const listed = (workspace?.profileNames ?? []).filter((name) => existing.has(name)).length;
  return listed + (hasMultiloginProfile ? 1 : 0);
}
