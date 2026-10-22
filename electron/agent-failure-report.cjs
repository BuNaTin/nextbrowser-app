// Decides which agent CLI runs (Codex, Claude Code, ...) are worth an error
// report, and finds the reason for a failed run in the CLI's error output.
// A run that exits non-zero on its own is reported. A stop the user asked for,
// a run cut short by quitting the app and a sign-in the chat already asks for
// are not. Standard output is never copied into a report: it is the reply,
// which can quote page data. From standard error only the error line is
// taken, because the rest of it is the agent's transcript.

// Same rule as finishAgentRun in src/store.ts, which asks the user to sign in.
const AUTH_FAILURE = /(?:failed to authenticate|oauth session expired|could not be refreshed|not logged in|sign in required|login required)/i;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// What the CLI prints when it gives up: "ERROR: ...", "Error: ...",
// "API Error: ...", "stream error: ...", or a Rust panic.
const FATAL_LINE = /^(?:\[[^\]]*\]\s*)?(?:[A-Za-z]+ )?(?:error|fatal)\s*:|panicked at /i;
// Codex also logs non-fatal internal errors as tracing lines
// ("2026-10-07T14:07:47Z ERROR codex_core::x: ..."); one is the reason only
// when nothing fatal was printed.
const LOG_ERROR_LINE = /^\S*\d{2}:\d{2}:\d{2}\S*\s+(?:ERROR|FATAL)\s/;
const REASON_MAX = 300;
const AGENT_ID = /^[a-z][a-z0-9-]{0,31}$/;

function agentFailureReason(stderr) {
  const lines = String(stderr || "").replace(ANSI, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  const line = lines.find((candidate) => FATAL_LINE.test(candidate)) || lines.find((candidate) => LOG_ERROR_LINE.test(candidate)) || "";
  return line.length > REASON_MAX ? `${line.slice(0, REASON_MAX - 1)}…` : line;
}

/**
 * Describes one finished agent run: the reason to show in the chat, and an
 * event only when the failure is unexpected (see the rule at the top).
 */
function describeAgentResult({ agentId, result, outcome = {}, durationMs, plain = false }) {
  const code = Number.isInteger(result?.code) ? result.code : -1;
  if (code === 0) return { reason: "", event: null };
  const stderr = String(result?.stderr ?? "");
  const reason = agentFailureReason(stderr);
  if (outcome.stopped || outcome.quitting) return { reason, event: null };
  if (AUTH_FAILURE.test(`${stderr}\n${result?.stdout ?? ""}`)) return { reason, event: null };
  const agent = AGENT_ID.test(String(agentId || "")) ? String(agentId) : "unknown";
  return {
    reason,
    event: {
      source: "agent",
      kind: "command_failed",
      name: "AGENT_STOPPED_UNEXPECTEDLY",
      message: `${agent} exited with code ${code}: ${reason || "no error line in its output"}`,
      context: {
        agent,
        exit_code: String(code),
        run: plain ? "plain" : "chat",
        ...(Number.isFinite(durationMs) ? { duration_ms: String(Math.round(durationMs)) } : {}),
      },
      fingerprintExtra: agent,
    },
  };
}

module.exports = {
  agentFailureReason,
  describeAgentResult,
};
