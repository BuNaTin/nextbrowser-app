// Scenarios in the order of the release checklist (tasks.md).
import workspace from "./workspace.mjs";
import profiles from "./profiles.mjs";
import proxy from "./proxy.mjs";
import agents from "./agents.mjs";
import terminal from "./terminal.mjs";

export const scenarios = [workspace, profiles, proxy, agents, terminal];
