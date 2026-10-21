import type { BrowserWorkflowAction, BrowserWorkflowSkill } from "../types";

// Mirrors electron/automation-shared-copies.cjs. A workflow or recording
// accepted from another account carries page scripts its recipient did not
// write, and they would run inside the recipient's signed-in profile. Until
// page scripts run isolated, a shared copy with its own script does not run,
// either as a replay or through the agent.
export const SHARED_SCRIPT_BLOCKED = "This automation was shared by another account and contains its own page script. Shared page scripts could read this profile's cookies and storage, so they are turned off for now. Remove the script steps, or record the workflow yourself, to run it.";

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isScriptTool(value: unknown): boolean {
  return typeof value === "string" && value.trim().replace(/^(?:clawbrowser|nextbrowser)\./i, "").toLowerCase() === "evaluate";
}

function containsScript(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => containsScript(item, depth + 1));
  if (!plainObject(value)) return false;
  if (["tool", "name", "type", "action"].some((key) => isScriptTool(value[key]))) return true;
  return Object.values(value).some((item) => containsScript(item, depth + 1));
}

export function scriptStepIndexes(actions: readonly BrowserWorkflowAction[]): number[] {
  return actions.flatMap((action, index) => containsScript(action) ? [index] : []);
}

export function isSharedCopy(workflow: Pick<BrowserWorkflowSkill, "sharedCopy" | "recipe">): boolean {
  return workflow.sharedCopy === true || plainObject(workflow.recipe?.shared_copy);
}

export function sharedScriptBlock(workflow: Pick<BrowserWorkflowSkill, "sharedCopy" | "recipe" | "actions">): string | undefined {
  return isSharedCopy(workflow) && scriptStepIndexes(workflow.actions).length ? SHARED_SCRIPT_BLOCKED : undefined;
}

/// A workflow built from a shared recording is still the sender's steps.
export function markedAsSharedCopy(workflow: BrowserWorkflowSkill, fromRecording: string): BrowserWorkflowSkill {
  return { ...workflow, sharedCopy: true, recipe: { ...workflow.recipe, shared_copy: { from_recording: fromRecording } } };
}
