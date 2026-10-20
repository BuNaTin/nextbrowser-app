import { describe, expect, it } from "vitest";
import type { BrowserWorkflowSkill } from "../types";
import { SHARED_SCRIPT_BLOCKED, isSharedCopy, markedAsSharedCopy, scriptStepIndexes, sharedScriptBlock } from "./sharedAutomation";

const open = { tool: "open", arguments: { url: "https://example.com" } };
const script = { tool: "evaluate", arguments: { expression: "document.title" } };

function workflow(overrides: Partial<BrowserWorkflowSkill> = {}): BrowserWorkflowSkill {
  const actions = overrides.actions ?? [open, script];
  return {
    id: "wf", title: "Shared", domain: "example.com", task: "Read the title", instructions: "", capability: "scrape",
    parametersSchema: {}, outputSchema: {}, createdAt: 1, updatedAt: 1,
    recipe: { version: 1, capability: "scrape", actions },
    ...overrides,
    actions,
  };
}

describe("shared automation copies", () => {
  it("finds page scripts the same way as the main process", () => {
    expect(scriptStepIndexes([
      open,
      script,
      { tool: "nextbrowser.evaluate", arguments: {} },
      { tool: "act", arguments: { tool: "EVALUATE", arguments: {} } },
      { tool: "click", arguments: { selector: "a" } },
    ])).toEqual([1, 2, 3]);
  });

  it("blocks a shared copy with its own script and nothing else", () => {
    expect(sharedScriptBlock(workflow({ sharedCopy: true }))).toBe(SHARED_SCRIPT_BLOCKED);
    expect(sharedScriptBlock(workflow({ recipe: { version: 1, capability: "scrape", actions: [open, script], shared_copy: { share_id: "s" } } }))).toBe(SHARED_SCRIPT_BLOCKED);
    expect(sharedScriptBlock(workflow({ sharedCopy: true, actions: [open] }))).toBeUndefined();
    expect(sharedScriptBlock(workflow())).toBeUndefined();
  });

  it("keeps a workflow built from a shared recording shared", () => {
    const built = markedAsSharedCopy(workflow(), "rec-1");
    expect(isSharedCopy(built)).toBe(true);
    expect(built.recipe.shared_copy).toEqual({ from_recording: "rec-1" });
  });
});
