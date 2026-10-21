const fs = require("node:fs");
const path = require("node:path");

// A workflow or recording accepted from another account is a copy the
// recipient did not write. Its page scripts (evaluate steps) run inside the
// recipient's signed-in profile, next to its cookies and storage. Until page
// scripts run isolated, a shared copy that carries its own script does not run.
const SHARED_SCRIPT_BLOCKED = "This automation was shared by another account and contains its own page script. Shared page scripts could read this profile's cookies and storage, so they are turned off for now. Remove the script steps, or record the workflow yourself, to run it.";

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isScriptTool(value) {
  return typeof value === "string" && value.trim().replace(/^(?:clawbrowser|nextbrowser)\./i, "").toLowerCase() === "evaluate";
}

// A script can also hide inside a generic step ({tool: "act", arguments:
// {tool: "evaluate", ...}}), so the whole step is searched.
function containsScript(value, depth = 0) {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => containsScript(item, depth + 1));
  if (!plainObject(value)) return false;
  if (["tool", "name", "type", "action"].some((key) => isScriptTool(value[key]))) return true;
  return Object.values(value).some((item) => containsScript(item, depth + 1));
}

function scriptStepIndexes(actions) {
  return (Array.isArray(actions) ? actions : []).flatMap((action, index) => containsScript(action) ? [index] : []);
}

function sharedCopyMarker(recipeOrDocument) {
  return plainObject(recipeOrDocument) && plainObject(recipeOrDocument.shared_copy) ? recipeOrDocument.shared_copy : undefined;
}

function sharedScriptBlock({ sharedCopy, actions }) {
  return sharedCopy && scriptStepIndexes(actions).length ? SHARED_SCRIPT_BLOCKED : undefined;
}

// Remembers on this computer which library items came from a share, so the
// block holds even if marking the server copy failed.
function createSharedCopyRegistry(file) {
  let cache;
  const read = () => {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = plainObject(parsed?.copies) ? parsed : { copies: {} };
    } catch {
      cache = { copies: {} };
    }
    return cache;
  };
  return {
    has(id) {
      return typeof id === "string" && !!id && Object.prototype.hasOwnProperty.call(read().copies, id);
    },
    mark(id, info = {}) {
      if (typeof id !== "string" || !id) return;
      const data = read();
      data.copies[id] = { kind: info.kind || "workflow", shareId: info.shareId || "", acceptedAt: info.acceptedAt || new Date().toISOString() };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(temp, file);
    },
  };
}

function annotateWorkflow(workflow, registry) {
  if (!plainObject(workflow)) return workflow;
  const sharedCopy = registry.has(workflow.id) || !!sharedCopyMarker(workflow.recipe);
  return sharedCopy ? { ...workflow, sharedCopy: true } : workflow;
}

function annotateRecording(recording, registry) {
  if (!plainObject(recording)) return recording;
  const sharedCopy = registry.has(recording.id) || !!sharedCopyMarker(recording.document);
  return sharedCopy ? { ...recording, sharedCopy: true } : recording;
}

// Marks the server copy as well, so the recipient's other computers block it
// too. Best effort: the local registry already holds the block.
async function markSharedCopyOnServer(accepted, shareId, api) {
  const marker = { share_id: shareId, accepted_at: new Date().toISOString() };
  if (accepted?.source_kind === "recording") {
    const recording = (await api.listRecordings()).find((item) => item.id === accepted.id);
    if (!recording || sharedCopyMarker(recording.document)) return;
    await api.putRecording({ id: recording.id, status: recording.status, document: { ...recording.document, shared_copy: marker }, base_revision: recording.revision || 0 });
    return;
  }
  const workflow = (await api.listWorkflows()).find((item) => item.id === accepted?.id);
  if (!workflow || sharedCopyMarker(workflow.recipe)) return;
  await api.putWorkflow({ ...workflow, recipe: { ...workflow.recipe, shared_copy: marker } });
}

module.exports = {
  SHARED_SCRIPT_BLOCKED,
  annotateRecording,
  annotateWorkflow,
  createSharedCopyRegistry,
  markSharedCopyOnServer,
  scriptStepIndexes,
  sharedCopyMarker,
  sharedScriptBlock,
};
