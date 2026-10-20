const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { describeBackendRequest, newTraceContext, setBackendRequestObserver, tracedBackendFetch } = require("./backend-fetch.cjs");
const { listProjects } = require("./project-sync.cjs");

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

function response(status, headers = {}) {
  return { status, ok: status < 400, headers: new Headers(headers), text: async () => "{}" };
}

test("adds a W3C traceparent and reports the request to the observer", async (t) => {
  const seen = [];
  setBackendRequestObserver((info) => seen.push(info));
  t.after(() => setBackendRequestObserver(null));
  const calls = [];
  const traced = tracedBackendFetch(async (url, init) => {
    calls.push({ url, init });
    return response(200, { "x-request-id": "req-9" });
  });
  await traced("https://core.test/v1/projects?x=1", { method: "get", headers: { authorization: "Bearer k" } });
  const [, traceId] = calls[0].init.headers.traceparent.match(TRACEPARENT);
  assert.equal(calls[0].init.headers.authorization, "Bearer k", "existing headers are kept");
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].status, 200);
  assert.equal(seen[0].traceId, traceId);
  assert.equal(seen[0].requestId, "req-9");
});

test("supports Headers instances and rethrows network errors unchanged", async (t) => {
  const seen = [];
  setBackendRequestObserver((info) => seen.push(info));
  t.after(() => setBackendRequestObserver(null));
  let sent;
  await tracedBackendFetch(async (_url, init) => { sent = init.headers; return response(204); })("https://api.test/x", { headers: new Headers({ accept: "application/json" }) });
  assert.match(sent.get("traceparent"), TRACEPARENT);
  assert.equal(sent.get("accept"), "application/json");
  const failure = new TypeError("fetch failed");
  await assert.rejects(tracedBackendFetch(async () => { throw failure; })("https://api.test/x"), (error) => error === failure);
  assert.equal(seen[1].error, failure);
});

test("an observer that throws cannot break the request", async (t) => {
  setBackendRequestObserver(() => { throw new Error("observer"); });
  t.after(() => setBackendRequestObserver(null));
  const result = await tracedBackendFetch(async () => response(200))("https://api.test/x");
  assert.equal(result.status, 200);
});

test("trace ids are random and never all zero", () => {
  const a = newTraceContext();
  const b = newTraceContext();
  assert.notEqual(a.traceId, b.traceId);
  const zero = newTraceContext((size) => Buffer.alloc(size));
  assert.match(zero.traceparent, TRACEPARENT);
  assert.notEqual(zero.traceId, "0".repeat(32));
});

test("5xx responses become api_error events with the backend trace id", () => {
  const { breadcrumb, event } = describeBackendRequest({
    url: "https://core.nextbrowser.com/v1/projects/3f2b1c9e-1d2c-4b5a-9e8f-0123456789ab?token=t",
    method: "PUT",
    status: 503,
    traceId: "a".repeat(32),
    responseTraceId: "B".repeat(32),
    requestId: "req-1",
    durationMs: 812.4,
  });
  assert.equal(breadcrumb, "PUT core.nextbrowser.com/v1/projects/:id → 503");
  assert.equal(event.kind, "api_error");
  assert.equal(event.name, "HTTP 503 PUT /v1/projects/:id");
  assert.equal(event.trace_id, "b".repeat(32));
  assert.equal(event.request_id, "req-1");
  assert.deepEqual(event.context, { method: "PUT", host: "core.nextbrowser.com", path: "/v1/projects/:id", duration_ms: "812", status: "503" });
  assert.ok(!JSON.stringify(event).includes("token"));
});

test("without X-Trace-Id the trace id sent in traceparent links the event", () => {
  const { event } = describeBackendRequest({ url: "https://api.test/v1/x", method: "GET", status: 500, traceId: "c".repeat(32), responseTraceId: "" });
  assert.equal(event.trace_id, "c".repeat(32));
});

test("network failures are reported; 4xx and caller aborts are breadcrumbs only", () => {
  const network = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND core.test"), { code: "ENOTFOUND" }) });
  const failed = describeBackendRequest({ url: "https://core.test/v1/workspaces", method: "GET", error: network, traceId: "d".repeat(32) });
  assert.equal(failed.breadcrumb, "GET core.test/v1/workspaces → ENOTFOUND");
  assert.equal(failed.event.name, "ENOTFOUND GET /v1/workspaces");
  assert.equal(failed.event.context.network_error, "ENOTFOUND");
  const timeout = describeBackendRequest({ url: "https://core.test/v1/workspaces", method: "GET", error: new DOMException("timed out", "TimeoutError"), traceId: "d".repeat(32) });
  assert.equal(timeout.event.context.network_error, "TimeoutError");
  assert.equal(describeBackendRequest({ url: "https://core.test/v1/x", method: "GET", status: 401 }).event, null);
  assert.equal(describeBackendRequest({ url: "https://core.test/v1/x", method: "GET", status: 404 }).event, null);
  assert.equal(describeBackendRequest({ url: "https://core.test/v1/x", method: "GET", error: new DOMException("aborted", "AbortError") }).event, null);
});

test("project sync requests carry a traceparent", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "backend-fetch-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "config.json"), JSON.stringify({ api_key: "secret" }));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(options);
    return { ok: true, status: 200, headers: new Headers(), text: async () => "{\"projects\":[]}" };
  };
  await listProjects({ env: { NEXTBROWSER_CONFIG_DIR: root, CLAWCTL_SKILL_SERVICE: "https://core.test" }, fetchImpl });
  assert.match(calls[0].headers.traceparent, TRACEPARENT);
  assert.equal(calls[0].headers.authorization, "Bearer secret");
});
