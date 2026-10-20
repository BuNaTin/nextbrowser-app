const assert = require("node:assert/strict");
const test = require("node:test");
const { describeNbcResult, expectsJSON, isNextctlBinary, nbcCommandName } = require("./nbc-failure-report.cjs");

const envelope = (code, message = "failed") => JSON.stringify({ ok: false, command: "x", error: { code, message, hint: "" } });

test("recognizes the nbc binary on every platform", () => {
  assert.equal(isNextctlBinary("/Users/a/.nextbrowser/managed-nextctl/nextctl"), true);
  assert.equal(isNextctlBinary("C:\\Users\\a\\AppData\\Roaming\\Nextbrowser\\managed-nextctl\\nextctl.exe"), true);
  assert.equal(isNextctlBinary("/usr/local/bin/nbc"), true);
  assert.equal(isNextctlBinary("tar"), false);
  assert.equal(isNextctlBinary("/usr/bin/claude"), false);
});

test("command names keep the command words and never the arguments", () => {
  assert.equal(nbcCommandName(["--verify-on-start-only", "start", "--profile", "My Shop", "--runtime", "clawbrowser", "--format", "json"]), "start");
  assert.equal(nbcCommandName(["--verify-on-start-only", "profiles", "create", "secret-name", "--manual-proxy", "--proxy-host", "h"]), "profiles create");
  assert.equal(nbcCommandName(["--runtime", "multilogin", "--multilogin-folder-id", "f1", "mobile", "profiles", "create", "phone", "--json"]), "mobile profiles create");
  assert.equal(nbcCommandName(["profiles", "requests", "approve", "req-123", "--format", "json"]), "profiles requests approve");
  assert.equal(nbcCommandName(["eval", "--profile", "p", "document.cookie"]), "eval");
  assert.equal(nbcCommandName(["https://example.com/?q=1"]), "unknown");
  assert.equal(nbcCommandName(["--version"]), "--version");
  assert.equal(nbcCommandName([]), "(none)");
  assert.equal(expectsJSON(["status", "--format", "json"]), true);
  assert.equal(expectsJSON(["profiles", "list", "--json"]), true);
  assert.equal(expectsJSON(["--help"]), false);
});

test("a successful JSON command is a breadcrumb only", () => {
  const { breadcrumb, event } = describeNbcResult({ args: ["status", "--profile", "p", "--format", "json"], result: { code: 0, stdout: "{\"ok\":true,\"data\":{}}", stderr: "" }, durationMs: 1234 });
  assert.equal(breadcrumb, "status → exit 0 1.2s");
  assert.equal(event, null);
});

test("expected outcomes the UI explains are not reported", () => {
  for (const code of ["VERIFY_FAILED", "PROFILE_NOT_FOUND", "API_KEY_REQUIRED", "PROXY_TRAFFIC_EXHAUSTED", "MULTILOGIN_AUTH_INVALID", "REDDIT_LOGIN_REQUIRED", "MOBILE_UI_NODE_NOT_FOUND"]) {
    const { breadcrumb, event } = describeNbcResult({ args: ["start", "--format", "json"], result: { code: 1, stdout: envelope(code), stderr: "" } });
    assert.equal(event, null, code);
    assert.ok(breadcrumb.endsWith(code));
  }
  const proxyLaunch = describeNbcResult({ args: ["start", "--format", "json"], result: { code: 1, stdout: envelope("LAUNCH_FAILED", "net::ERR_TUNNEL_CONNECTION_FAILED"), stderr: "" } });
  assert.equal(proxyLaunch.event, null, "a proxy that refuses the launch is the profile's configuration");
  const signedOut = describeNbcResult({ args: ["start", "--format", "json"], result: { code: 1, stdout: envelope("REMOTE_BACKEND_ERROR", "backend returned 401 Unauthorized"), stderr: "" } });
  assert.equal(signedOut.event, null);
  const offline = describeNbcResult({ args: ["start", "--format", "json"], result: { code: 1, stdout: envelope("VERIFY_UNAVAILABLE", "dial tcp: lookup api.nextbrowser.com: no such host"), stderr: "" } });
  assert.equal(offline.event, null, "an offline machine is not an nbc defect");
  const closedBrowser = describeNbcResult({ args: ["tabs", "--profile", "p", "--format", "json"], result: { code: 1, stdout: envelope("CDP_UNREACHABLE"), stderr: "" } });
  assert.equal(closedBrowser.event, null, "a browser the user closed");
  const startUnreachable = describeNbcResult({ args: ["start", "--profile", "p", "--format", "json"], result: { code: 1, stdout: envelope("CDP_UNREACHABLE"), stderr: "" } });
  assert.equal(startUnreachable.event.name, "CDP_UNREACHABLE", "a start that cannot reach its own browser is reported");
});

test("cancellations, timeouts and usage probes are not reported", () => {
  assert.equal(describeNbcResult({ args: ["start", "--format", "json"], result: { code: -1, stdout: "", stderr: "Command cancelled." }, outcome: { cancelled: true } }).event, null);
  assert.equal(describeNbcResult({ args: ["start", "--format", "json"], result: { code: -1, stdout: "", stderr: "Command timed out after 240 seconds." }, outcome: { timedOut: true, signal: "SIGTERM" } }).event, null);
  assert.equal(describeNbcResult({ args: ["update", "--browser-only", "--format", "json"], result: { code: 1, stdout: "", stderr: "Error: unknown flag: --browser-only" } }).event, null);
  assert.equal(describeNbcResult({ args: ["mcp", "--automation-trace-file", "rel"], result: { code: 1, stdout: "", stderr: "automation trace file must be an absolute path" } }).event, null, "text-mode exit 1 is nbc's ordinary error");
});

test("nbc defects and unknown codes are reported with the code and command", () => {
  const { event } = describeNbcResult({
    args: ["--verify-on-start-only", "start", "--profile", "Shop", "--runtime", "clawbrowser", "--format", "json"],
    result: { code: 1, stdout: envelope("INTERNAL_ERROR", "session state corrupt"), stderr: "" },
    durationMs: 5000,
  });
  assert.equal(event.source, "nbc");
  assert.equal(event.kind, "command_failed");
  assert.equal(event.name, "INTERNAL_ERROR");
  assert.equal(event.message, "nbc start: session state corrupt");
  assert.deepEqual(event.context, { command: "start", exit_code: "1", runtime: "clawbrowser", duration_ms: "5000", nbc_code: "INTERNAL_ERROR" });
  assert.ok(!JSON.stringify(event).includes("Shop"), "arguments never reach the report");
  assert.equal(describeNbcResult({ args: ["start", "--format", "json"], result: { code: 1, stdout: envelope("BRAND_NEW_CODE"), stderr: "" } }).event.name, "BRAND_NEW_CODE");
});

test("crashes, spawn failures and missing JSON are reported", () => {
  const panic = describeNbcResult({
    args: ["profiles", "list", "--format", "json"],
    result: { code: 2, stdout: "", stderr: "panic: runtime error: index out of range [3] with length 3\n\ngoroutine 1 [running]:\nmain.listProfiles(...)\n\t/build/cmd/nbc/profiles.go:120 +0x1d" },
  }).event;
  assert.equal(panic.name, "NBC_CRASH");
  assert.match(panic.message, /index out of range/);
  assert.match(panic.stack, /goroutine 1/);

  const windowsCrash = describeNbcResult({ args: ["status"], result: { code: 3221225477, stdout: "", stderr: "" } }).event;
  assert.equal(windowsCrash.name, "NBC_ABNORMAL_EXIT");
  const killed = describeNbcResult({ args: ["start", "--format", "json"], result: { code: -1, stdout: "", stderr: "" }, outcome: { signal: "SIGKILL" } }).event;
  assert.equal(killed.context.signal, "SIGKILL");

  const spawn = describeNbcResult({ args: ["status"], result: { code: -1, stdout: "", stderr: "spawn ~/nextctl EACCES" }, outcome: { spawnError: true } }).event;
  assert.equal(spawn.name, "NBC_SPAWN_FAILED");

  const garbled = describeNbcResult({ args: ["profiles", "list", "--format", "json"], result: { code: 0, stdout: "<html>page data</html>", stderr: "warning: slow disk" } }).event;
  assert.equal(garbled.name, "NBC_NON_JSON_OUTPUT");
  assert.ok(!garbled.message.includes("page data"), "standard output is never copied into a report");
  assert.match(garbled.message, /warning: slow disk/);
});
