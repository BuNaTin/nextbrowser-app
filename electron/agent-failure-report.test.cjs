const assert = require("node:assert/strict");
const test = require("node:test");
const { agentFailureReason, describeAgentResult } = require("./agent-failure-report.cjs");

const codexLog = [
  "OpenAI Codex v0.163.0 (research preview)",
  "--------",
  "workdir: /Users/a/Nextbrowser/workspace",
  "--------",
  "user",
  "Open the shop page and read the price.",
  "2026-10-23T07:02:11.831641Z ERROR codex_memories_write::phase2: Phase 2 no changes",
  "thinking",
  "Error handling on the page looks odd.",
].join("\n");

test("the reason is the line the CLI printed when it gave up", () => {
  assert.equal(agentFailureReason(`${codexLog}\nERROR: You've hit your usage limit. Try again later.\n`), "ERROR: You've hit your usage limit. Try again later.");
  assert.equal(agentFailureReason("\x1b[31mError: unknown option '--output-format'\x1b[0m\n"), "Error: unknown option '--output-format'");
  assert.equal(agentFailureReason("API Error: 529 Overloaded\n"), "API Error: 529 Overloaded");
  assert.equal(agentFailureReason("thread 'main' panicked at codex-rs/exec/src/lib.rs:88:5:\nboom\n"), "thread 'main' panicked at codex-rs/exec/src/lib.rs:88:5:");
});

test("an internal error log line is the reason only when nothing fatal was printed", () => {
  assert.equal(agentFailureReason(codexLog), "2026-10-23T07:02:11.831641Z ERROR codex_memories_write::phase2: Phase 2 no changes");
  assert.equal(agentFailureReason("user\nhello\n"), "");
  assert.equal(agentFailureReason(""), "");
});

test("a long reason is cut", () => {
  const reason = agentFailureReason(`ERROR: ${"x".repeat(1000)}`);
  assert.equal(reason.length, 300);
  assert.ok(reason.endsWith("…"));
});

test("a failed run is reported with the error line and without the transcript or the reply", () => {
  const { reason, event } = describeAgentResult({
    agentId: "codex",
    result: { code: 1, stdout: "The price is 42 EUR", stderr: `${codexLog}\nERROR: stream disconnected before completion\n` },
    durationMs: 5321.4,
  });
  assert.equal(reason, "ERROR: stream disconnected before completion");
  assert.deepEqual(event, {
    source: "agent",
    kind: "command_failed",
    name: "AGENT_STOPPED_UNEXPECTEDLY",
    message: "codex exited with code 1: ERROR: stream disconnected before completion",
    context: { agent: "codex", exit_code: "1", run: "chat", duration_ms: "5321" },
    fingerprintExtra: "codex",
  });
  assert.ok(!JSON.stringify(event).includes("shop page"));
  assert.ok(!JSON.stringify(event).includes("42 EUR"));
});

test("a failure without an error line is still reported", () => {
  const { reason, event } = describeAgentResult({ agentId: "claude", result: { code: 3221225477, stdout: "", stderr: "" }, plain: true });
  assert.equal(reason, "");
  assert.equal(event.message, "claude exited with code 3221225477: no error line in its output");
  assert.equal(event.context.run, "plain");
});

test("success, a stop, quitting and a sign-in are not reported", () => {
  assert.deepEqual(describeAgentResult({ agentId: "codex", result: { code: 0, stdout: "done", stderr: "ERROR: ignored" } }), { reason: "", event: null });
  assert.equal(describeAgentResult({ agentId: "codex", result: { code: -1, stdout: "", stderr: "" }, outcome: { stopped: true } }).event, null);
  assert.equal(describeAgentResult({ agentId: "codex", result: { code: 1, stdout: "", stderr: "" }, outcome: { quitting: true } }).event, null);
  const signIn = describeAgentResult({ agentId: "claude", result: { code: 1, stdout: "Failed to authenticate: OAuth session expired and could not be refreshed", stderr: "" } });
  assert.equal(signIn.event, null);
});

test("an unexpected agent id is not sent as is", () => {
  assert.equal(describeAgentResult({ agentId: "../../etc", result: { code: 1, stdout: "", stderr: "" } }).event.context.agent, "unknown");
});
