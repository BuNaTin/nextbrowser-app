import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkillEntry } from "../skillsCatalog";
import { RunSkillSheet, skillRunTarget, skillRunTask } from "./RunSkillSheet";

function entry(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    id: "repository:keeper-autofill-login",
    title: "Keeper autofill login",
    subtitle: "Current tab",
    selector: { kind: "current_tab", value: "current tab" },
    category: "repository",
    categoryTitle: "Repository",
    categoryIcon: "globe",
    categoryOrder: 1,
    ...overrides,
  };
}

describe("Run sheet on a skill card", () => {
  it("asks for an optional task for this run", () => {
    const html = renderToStaticMarkup(<RunSkillSheet entry={entry()} onClose={vi.fn()} onRun={vi.fn()} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Run Keeper autofill login");
    expect(html).toContain("Task for this run (optional)");
    expect(html).toContain("<textarea");
    expect(html).toContain("on the current tab");
    // Empty is allowed: a skill that needs no input still runs.
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Run skill<\/button>/);
  });

  it("names the site for a domain skill", () => {
    expect(skillRunTarget(entry({ selector: { kind: "domain", value: "github.com" } }))).toBe("github.com");
  });

  it("passes no task when the field is left empty", () => {
    expect(skillRunTask("   \n ")).toBeUndefined();
    expect(skillRunTask("  Fill in the login form, but don't submit it.\n")).toBe("Fill in the login form, but don't submit it.");
  });
});
