const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  SHARED_SCRIPT_BLOCKED, annotateRecording, annotateWorkflow, createSharedCopyRegistry,
  markSharedCopyOnServer, scriptStepIndexes, sharedScriptBlock,
} = require("./automation-shared-copies.cjs");
const { executeAutomationRecipe } = require("./automation-runner.cjs");

const script = { tool: "evaluate", arguments: { expression: "document.title" } };
const open = { tool: "open", arguments: { url: "https://example.com" } };

test("finds page scripts, including prefixed and nested ones", () => {
  assert.deepEqual(scriptStepIndexes([
    open,
    script,
    { tool: "clawbrowser.evaluate", arguments: { expression: "1" } },
    { tool: "act", arguments: { tool: "Evaluate", arguments: { expression: "1" } } },
    { tool: "extract", arguments: { container: "tr", fields: { name: { selector: ".name" } } } },
  ]), [1, 2, 3]);
  assert.deepEqual(scriptStepIndexes([open, { tool: "click", arguments: { selector: "a" } }]), []);
});

test("blocks only shared copies that carry a script", () => {
  assert.equal(sharedScriptBlock({ sharedCopy: true, actions: [open, script] }), SHARED_SCRIPT_BLOCKED);
  assert.equal(sharedScriptBlock({ sharedCopy: true, actions: [open] }), undefined);
  assert.equal(sharedScriptBlock({ sharedCopy: false, actions: [open, script] }), undefined);
});

test("remembers accepted copies on this computer", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nb-shared-")), "automation-shared-copies.json");
  createSharedCopyRegistry(file).mark("wf-1", { kind: "workflow", shareId: "share-1" });
  const registry = createSharedCopyRegistry(file);
  assert.equal(registry.has("wf-1"), true);
  assert.equal(registry.has("wf-2"), false);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  assert.equal(annotateWorkflow({ id: "wf-1", recipe: { actions: [] } }, registry).sharedCopy, true);
  assert.equal(annotateWorkflow({ id: "wf-3", recipe: { actions: [], shared_copy: { share_id: "s" } } }, registry).sharedCopy, true);
  assert.equal(annotateWorkflow({ id: "wf-4", recipe: { actions: [] } }, registry).sharedCopy, undefined);
  assert.equal(annotateRecording({ id: "rec-1", document: { shared_copy: {} } }, registry).sharedCopy, true);
});

test("marks the accepted copy on the server so other computers block it too", async () => {
  const put = [];
  const api = {
    listWorkflows: async () => [{ id: "wf-1", title: "T", recipe: { version: 1, actions: [script] }, actions: [script], revision: 3 }],
    putWorkflow: async (workflow) => put.push(workflow),
    listRecordings: async () => [{ id: "rec-1", status: "completed", revision: 2, document: { run: { id: "run-1" } } }],
    putRecording: async (recording) => put.push(recording),
  };
  await markSharedCopyOnServer({ id: "wf-1", source_kind: "workflow" }, "share-1", api);
  await markSharedCopyOnServer({ id: "rec-1", source_kind: "recording" }, "share-2", api);
  assert.equal(put[0].recipe.shared_copy.share_id, "share-1");
  assert.equal(put[0].revision, 3);
  assert.equal(put[1].document.shared_copy.share_id, "share-2");
  assert.deepEqual(put[1].document.run, { id: "run-1" });
  assert.equal(put[1].base_revision, 2);
});

test("the runner refuses a shared copy's script before launching the browser", async () => {
  for (const input of [
    { sharedCopy: true, recipe: { version: 1, actions: [open, script] } },
    { recipe: { version: 1, actions: [open, script], shared_copy: { share_id: "share-1" } } },
  ]) {
    let launched = false;
    await assert.rejects(
      executeAutomationRecipe({ executionId: `shared-${launched}-${Math.random().toString(36).slice(2)}`, ...input }, {
        binary: "nbc", env: {}, spawnImpl: () => { launched = true; throw new Error("must not launch"); },
      }),
      (error) => error.message === SHARED_SCRIPT_BLOCKED,
    );
    assert.equal(launched, false);
  }
});

test("the runner still launches a shared copy without scripts", async () => {
  let launched = false;
  await assert.rejects(
    executeAutomationRecipe({ executionId: "shared-no-script", sharedCopy: true, recipe: { version: 1, actions: [open] } }, {
      binary: "nbc", env: {}, spawnImpl: () => { launched = true; throw new Error("launched"); },
    }),
    /launched/,
  );
  assert.equal(launched, true);
});
