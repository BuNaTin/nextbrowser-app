const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { GROUPS, LIMITS, clientEnvironmentAllowed, createClientEnvironment, normalizeGroups } = require("./client-environment.cjs");

const INSTALL_ID = "3f1c2b8e-1d2a-4c55-9b7a-0d6f5e4c3b2a";
const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;
const bytes = (value) => Buffer.byteLength(String(value), "utf8");
const LANGUAGE_TAG = /^[A-Za-z0-9_-]{1,35}$/;
const TYPE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function onlyKeys(object, allowed, where) {
  assert.equal(typeof object, "object", where);
  for (const key of Object.keys(object)) assert.ok(allowed.includes(key), `${where}: unknown field ${key}`);
}

function text(value, max, where) {
  assert.equal(typeof value, "string", where);
  assert.ok(value.trim() === value && value.length > 0, `${where}: trimmed and not empty`);
  assert.ok(bytes(value) <= max, `${where}: at most ${max} bytes`);
}

function integer(value, min, max, where) {
  assert.ok(Number.isInteger(value) && value >= min && value <= max, `${where}: integer ${min}..${max}`);
}

// Mirrors POST /v1/client-environment: unknown fields anywhere and values over
// a limit are refused, so a report must stay inside all of these.
function assertContract(body) {
  onlyKeys(body, ["install_id", "groups"], "body");
  assert.match(body.install_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  onlyKeys(body.groups, GROUPS, "groups");
  const { locale, keyboard, device, app, network } = body.groups;
  if (locale) {
    onlyKeys(locale, ["ui_language", "preferred_languages", "regional_format", "timezone", "utc_offset_minutes"], "locale");
    for (const key of ["ui_language", "regional_format"]) if (locale[key] !== undefined) assert.match(locale[key], LANGUAGE_TAG);
    if (locale.preferred_languages) {
      assert.ok(locale.preferred_languages.length <= 20);
      for (const tag of locale.preferred_languages) assert.match(tag, LANGUAGE_TAG);
    }
    if (locale.timezone !== undefined) assert.match(locale.timezone, /^[A-Za-z0-9_+\-/]{1,64}$/);
    if (locale.utc_offset_minutes !== undefined) integer(locale.utc_offset_minutes, -840, 840, "utc_offset_minutes");
  }
  if (keyboard) {
    onlyKeys(keyboard, ["layouts", "current"], "keyboard");
    if (keyboard.layouts) {
      assert.ok(keyboard.layouts.length <= 32);
      for (const layout of keyboard.layouts) {
        onlyKeys(layout, ["id", "name", "language"], "layout");
        text(layout.id, 128, "layout.id");
        if (layout.name !== undefined) text(layout.name, 128, "layout.name");
        if (layout.language !== undefined) assert.match(layout.language, LANGUAGE_TAG);
      }
    }
    if (keyboard.current !== undefined) text(keyboard.current, 128, "keyboard.current");
  }
  if (device) {
    onlyKeys(device, ["os", "os_name", "os_version", "os_build", "arch", "cpu_model", "cpu_cores", "ram_bytes", "gpus", "displays"], "device");
    assert.ok(["windows", "macos", "linux"].includes(device.os), "device.os is required");
    for (const key of ["os_name", "os_version", "os_build"]) if (device[key] !== undefined) text(device[key], 64, key);
    if (device.arch !== undefined) assert.match(device.arch, /^[a-z0-9_]{1,16}$/);
    if (device.cpu_model !== undefined) text(device.cpu_model, 128, "cpu_model");
    if (device.cpu_cores !== undefined) integer(device.cpu_cores, 1, 1024, "cpu_cores");
    if (device.ram_bytes !== undefined) integer(device.ram_bytes, 0, 2 ** 50, "ram_bytes");
    if (device.gpus) {
      assert.ok(device.gpus.length <= 8);
      for (const gpu of device.gpus) {
        onlyKeys(gpu, ["name", "vendor", "driver_version"], "gpu");
        text(gpu.name, 256, "gpu.name");
        if (gpu.vendor !== undefined) text(gpu.vendor, 128, "gpu.vendor");
        if (gpu.driver_version !== undefined) text(gpu.driver_version, 64, "gpu.driver_version");
      }
    }
    if (device.displays) {
      assert.ok(device.displays.length <= 16);
      for (const display of device.displays) {
        onlyKeys(display, ["width", "height", "scale_factor", "primary"], "display");
        integer(display.width, 1, 32768, "display.width");
        integer(display.height, 1, 32768, "display.height");
        if (display.scale_factor !== undefined) assert.ok(display.scale_factor >= 0.25 && display.scale_factor <= 8);
        if (display.primary !== undefined) assert.equal(typeof display.primary, "boolean");
      }
    }
  }
  if (app) {
    onlyKeys(app, ["app_version", "nbc_version", "runtimes", "agents", "multilogin_connected", "workspaces_count", "profiles_count"], "app");
    for (const key of ["app_version", "nbc_version"]) if (app[key] !== undefined) text(app[key], 32, key);
    if (app.runtimes) {
      assert.ok(app.runtimes.length <= 16);
      for (const runtime of app.runtimes) {
        onlyKeys(runtime, ["name", "version"], "runtime");
        assert.match(runtime.name, TYPE_ID);
        if (runtime.version !== undefined) text(runtime.version, 64, "runtime.version");
      }
    }
    if (app.agents) {
      assert.ok(app.agents.length <= 16);
      for (const agent of app.agents) assert.match(agent, TYPE_ID);
    }
    if (app.multilogin_connected !== undefined) assert.equal(typeof app.multilogin_connected, "boolean");
    for (const key of ["workspaces_count", "profiles_count"]) if (app[key] !== undefined) integer(app[key], 0, 1_000_000, key);
  }
  if (network) assert.deepEqual(network, {});
}

const SNAPSHOT = {
  locale: { ui_language: "ru-RU", preferred_languages: ["ru-RU", "en-US"], regional_format: "ru-RU", timezone: "Europe/Moscow", utc_offset_minutes: 180 },
  keyboard: { layouts: [{ id: "00000409", name: "US", language: "en-US" }, { id: "00000419", name: "Russian", language: "ru" }], current: "00000409" },
  device: { os: "windows", os_name: "Windows 11 Pro", os_version: "10.0.26100", os_build: "26100.4061", arch: "x64", cpu_model: "AMD Ryzen 9 7950X 16-Core Processor", cpu_cores: 32, ram_bytes: 68719476736, gpus: [{ name: "NVIDIA GeForce RTX 4090", vendor: "NVIDIA", driver_version: "32.0.15.6094" }], displays: [{ width: 3840, height: 2160, scale_factor: 1.5, primary: true }] },
  app: { app_version: "0.2.68", nbc_version: "1.2.37", runtimes: [{ name: "clawbrowser", version: "148.0.7778.97" }], agents: ["claude", "codex"], multilogin_connected: false, workspaces_count: 3, profiles_count: 12 },
  network: {},
};

function harness(t, overrides = {}) {
  const dir = overrides.dir || fs.mkdtempSync(path.join(os.tmpdir(), "client-environment-"));
  if (!overrides.dir) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = overrides.start ?? Date.parse("2026-10-21T10:00:00.000Z");
  const timers = [];
  const requests = [];
  const collected = [];
  const h = {
    dir,
    timers,
    requests,
    collected,
    apiKey: overrides.apiKey ?? "nb_live_first",
    policy: overrides.policy ?? { status: 200, body: { consent_required: false } },
    responses: [...(overrides.responses || [])],
    snapshot: structuredClone(overrides.snapshot || SNAPSHOT),
    advance: (ms) => { clock += ms; },
    posts: () => requests.filter((request) => request.init.method === "POST"),
    lastBody: () => h.posts().at(-1)?.body,
    state: () => JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")),
    timer: (ms) => timers.find((timer) => timer.ms === ms),
    // A fired timer is gone, as with real timers.
    fire: (timer) => {
      assert.ok(timers.includes(timer), "the timer is still scheduled");
      timers.splice(timers.indexOf(timer), 1);
      return timer.fn();
    },
  };
  h.env = createClientEnvironment({
    dir,
    allowed: overrides.allowed ?? true,
    installId: () => INSTALL_ID,
    resolveEndpoint: async () => ({ baseURL: "https://api.test", apiKey: h.apiKey }),
    collect: async (groups) => {
      collected.push([...groups]);
      return Object.fromEntries(groups.map((key) => [key, structuredClone(h.snapshot[key])]));
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
      const next = url.endsWith("/policy") ? h.policy : (h.responses.length ? h.responses.shift() : { status: 204 });
      if (next instanceof Error) throw next;
      return {
        status: next.status,
        headers: { get: (name) => next.headers?.[name.toLowerCase()] ?? null },
        json: async () => next.body,
      };
    },
    platform: overrides.platform ?? "win32",
    now: () => clock,
    random: () => 0.5,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
    options: overrides.options,
  });
  return h;
}

test("device data is off in development builds unless forced, and can be forced off", () => {
  assert.equal(clientEnvironmentAllowed({ isDevBuild: false, env: {} }), true);
  assert.equal(clientEnvironmentAllowed({ isDevBuild: true, env: {} }), false);
  assert.equal(clientEnvironmentAllowed({ isDevBuild: true, env: { NEXTBROWSER_CLIENT_ENVIRONMENT: "1" } }), true);
  assert.equal(clientEnvironmentAllowed({ isDevBuild: false, env: { NEXTBROWSER_CLIENT_ENVIRONMENT: "0" } }), false);
});

test("sends every group that is on in the contract shape, with the install id and the account key", async (t) => {
  const h = harness(t);
  await h.env.check("due");
  const [policy, report] = h.requests;
  assert.equal(policy.url, "https://api.test/v1/client-environment/policy");
  assert.equal(policy.init.method, "GET");
  assert.equal(policy.init.headers.authorization, "Bearer nb_live_first");
  assert.equal(report.url, "https://api.test/v1/client-environment");
  assert.equal(report.init.method, "POST");
  assert.equal(report.init.headers.authorization, "Bearer nb_live_first");
  assert.equal(report.init.headers["content-type"], "application/json");
  assertContract(report.body);
  assert.deepEqual(report.body, { install_id: INSTALL_ID, groups: SNAPSHOT });
});

test("stores tri-state choices and only a hash of the account key", async (t) => {
  const h = harness(t);
  assert.deepEqual(h.env.status(), { available: true, groups: { locale: true, keyboard: true, device: true, app: true, network: true } });
  h.env.setGroup("keyboard", false);
  h.env.setGroup("device", true);
  h.env.setGroup("unknown", false);
  await h.env.check("due");
  const stored = h.state();
  assert.deepEqual(stored.groups, { keyboard: "off", device: "on" }, "unset groups are not written");
  assert.equal(stored.consent_required, false);
  const raw = fs.readFileSync(path.join(h.dir, "state.json"), "utf8");
  assert.ok(!raw.includes("nb_live_first"), "the key is never stored");
  assert.deepEqual(Object.keys(stored.accounts).map((key) => key.length), [32]);

  // A new run reads the same choices back.
  const again = harness(t, { dir: h.dir });
  assert.deepEqual(again.env.status().groups, { locale: true, keyboard: false, device: true, app: true, network: true });
});

test("a group that is off is absent from the report and is never collected", async (t) => {
  const h = harness(t);
  h.env.setGroup("keyboard", false);
  h.env.setGroup("network", false);
  await h.env.check("due");
  assert.deepEqual(Object.keys(h.lastBody().groups), ["locale", "device", "app"]);
  assert.ok(h.collected.every((groups) => !groups.includes("keyboard") && !groups.includes("network")));
});

test("unset groups follow the policy: off where consent is required, explicit choices win", async (t) => {
  const h = harness(t, { policy: { status: 200, body: { consent_required: true } } });
  await h.env.check("due");
  assert.deepEqual(h.lastBody().groups, {}, "everything unset stays off");
  assert.deepEqual(h.collected, [[]], "nothing is read from the device");
  assert.deepEqual(h.env.status().groups, { locale: false, keyboard: false, device: false, app: false, network: false });

  h.env.setGroup("locale", true);
  await h.env.check("due");
  assert.deepEqual(Object.keys(h.lastBody().groups), ["locale"]);

  // Once every group is chosen the policy is no longer asked.
  for (const key of GROUPS) h.env.setGroup(key, key !== "app");
  await h.env.check("due");
  const before = h.requests.filter((request) => request.url.endsWith("/policy")).length;
  h.env.setGroup("app", false);
  await h.env.check("due");
  assert.equal(h.requests.filter((request) => request.url.endsWith("/policy")).length, before);
});

test("without a policy answer unset groups are off, but data the user never turned off is not deleted", async (t) => {
  const first = harness(t, { policy: new Error("offline") });
  first.env.setGroup("device", true);
  await first.env.check("due");
  assert.deepEqual(Object.keys(first.lastBody().groups), ["device"], "a first report carries only explicit groups");

  const h = harness(t);
  await h.env.check("due");
  assert.equal(h.posts().length, 1);
  h.policy = { status: 503 };
  h.advance(2 * DAY);
  await h.env.check("due");
  assert.equal(h.posts().length, 1, "a report without the unset groups would delete them");
  assert.ok(h.timers.some((timer) => timer.ms >= 1_000), "the attempt is retried");
  h.policy = { status: 200, body: { consent_required: false } };
  h.advance(2 * HOUR);
  await h.env.check("due");
  assert.equal(h.posts().length, 2);
  assert.deepEqual(Object.keys(h.lastBody().groups), GROUPS);
});

test("schedule: at launch a due report is sent, the hourly check sends a due report only when it changed", async (t) => {
  const h = harness(t);
  h.env.start();
  const launch = h.timer(60_000);
  assert.ok(launch, "the launch report waits for the app to settle");
  await h.fire(launch);
  await h.env.check("due");
  assert.equal(h.posts().length, 1, "within 24 h nothing more is sent");

  h.advance(5 * HOUR);
  h.snapshot.app.profiles_count = 13;
  await h.env.check("periodic");
  assert.equal(h.posts().length, 1, "a changed snapshot still waits for the 24 h clock");

  h.advance(20 * HOUR);
  h.snapshot.app.profiles_count = 12;
  await h.env.check("periodic");
  assert.equal(h.posts().length, 1, "due, but the snapshot is the one last sent");

  h.snapshot.app.profiles_count = 14;
  await h.env.check("periodic");
  assert.equal(h.posts().length, 2, "due and changed");
  assert.equal(h.lastBody().groups.app.profiles_count, 14);

  // The next launch sends a due report even when nothing changed.
  h.advance(DAY);
  const next = harness(t, { dir: h.dir, start: Date.parse("2026-10-21T10:00:00.000Z") + 2 * DAY + 25 * HOUR });
  await next.env.check("due");
  assert.equal(next.posts().length, 1);
});

test("a check that is not due makes no request and reads nothing from the device", async (t) => {
  const h = harness(t);
  await h.env.check("due");
  const requests = h.requests.length;
  for (let hour = 1; hour < 24; hour += 1) {
    h.advance(HOUR);
    await h.env.check("periodic");
    await h.env.check("due");
  }
  assert.equal(h.requests.length, requests, "offline machines do not fail a request every hour");
  assert.equal(h.collected.length, 1);
});

test("the hourly check re-arms itself and the settle timer replaces the launch timer", async (t) => {
  const h = harness(t);
  h.env.start();
  h.env.checkSoon();
  assert.equal(h.timer(60_000), undefined, "the launch timer is replaced once the app reported its state");
  const settle = h.timer(10_000);
  h.env.checkSoon();
  assert.ok(!h.timers.includes(settle), "a later push restarts the settle delay");
  await h.fire(h.timer(10_000));
  await h.env.check("periodic");
  assert.equal(h.posts().length, 1);
  const hourly = h.timer(HOUR);
  h.fire(hourly);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.timers.some((timer) => timer.ms === HOUR && timer !== hourly), "the next hourly check is scheduled");
  h.env.stop();
  assert.equal(h.timers.length, 0, "stop clears every timer");
});

test("a toggle is sent at once, without waiting for the 24 h clock", async (t) => {
  const h = harness(t);
  await h.env.check("due");
  h.advance(HOUR);
  h.env.setGroup("keyboard", false);
  await h.env.check("periodic");
  assert.equal(h.posts().length, 2);
  assert.ok(!("keyboard" in h.lastBody().groups), "turning a group off deletes it on the backend");
  h.env.setGroup("keyboard", true);
  await h.env.check("periodic");
  assert.equal(h.posts().length, 3);
  assert.ok("keyboard" in h.lastBody().groups);
});

test("signed out: nothing is collected or sent, and a toggle made meanwhile is sent at the next sign-in", async (t) => {
  const h = harness(t);
  await h.env.check("due");
  h.apiKey = "";
  h.env.setGroup("device", false);
  await h.env.check("due");
  await h.env.check("periodic");
  assert.equal(h.posts().length, 1);
  assert.equal(h.collected.length, 1, "no collection while signed out");

  h.apiKey = "nb_live_first";
  await h.env.check("due");
  assert.equal(h.posts().length, 2, "the groups differ from the last report, so it is due at once");
  assert.ok(!("device" in h.lastBody().groups));
});

test("the 24 h clock is per account: signing in to another account reports at once", async (t) => {
  const h = harness(t);
  await h.env.check("due");
  h.advance(HOUR);
  h.apiKey = "nb_live_second";
  await h.env.check("due");
  assert.equal(h.posts().length, 2);
  assert.equal(h.posts()[1].init.headers.authorization, "Bearer nb_live_second");
  h.apiKey = "nb_live_first";
  await h.env.check("due");
  assert.equal(h.posts().length, 2, "the first account reported an hour ago");
  assert.equal(Object.keys(h.state().accounts).length, 2);
});

test("backend answers: a refused key waits for another sign-in, a missing endpoint pauses the run", async (t) => {
  const refused = harness(t, { responses: [{ status: 401 }] });
  await refused.env.check("due");
  refused.env.setGroup("app", false);
  await refused.env.check("toggle");
  assert.equal(refused.posts().length, 1, "no retries with a key the backend refused");
  refused.apiKey = "nb_live_second";
  await refused.env.check("due");
  assert.equal(refused.posts().length, 2);

  const missing = harness(t, { responses: [{ status: 404 }] });
  await missing.env.check("due");
  missing.env.setGroup("app", false);
  await missing.env.check("toggle");
  assert.equal(missing.posts().length, 1, "an older backend is not asked again this run");
});

test("backend answers: 429 and 5xx are retried later, a refused snapshot is not resent", async (t) => {
  const limited = harness(t, { responses: [{ status: 429, headers: { "retry-after": "120" } }] });
  await limited.env.check("toggle");
  assert.ok(limited.timer(120_000), "Retry-After sets the retry");
  limited.advance(60_000);
  await limited.env.check("due");
  assert.equal(limited.posts().length, 1, "nothing is sent before Retry-After");
  const retry = limited.timer(60_000);
  assert.ok(retry, "the retry stays at the Retry-After time");
  limited.advance(60_000);
  await limited.fire(retry);
  await limited.env.check("due");
  assert.equal(limited.posts().length, 2);

  const failing = harness(t, { responses: [{ status: 503 }, new Error("ECONNRESET")] });
  await failing.env.check("due");
  assert.ok(failing.timers.some((timer) => timer.ms === 60_000), "first backoff is a minute");
  failing.advance(60_000);
  await failing.env.check("due");
  assert.ok(failing.timers.some((timer) => timer.ms === 120_000), "then it doubles");
  failing.advance(120_000);
  await failing.env.check("due");
  assert.equal(failing.posts().length, 3);
  assert.ok(failing.state().accounts);

  const invalid = harness(t, { responses: [{ status: 400 }] });
  await invalid.env.check("due");
  await invalid.env.check("toggle");
  assert.equal(invalid.posts().length, 1, "the same snapshot would be refused again");
  invalid.snapshot.app.profiles_count = 99;
  await invalid.env.check("toggle");
  assert.equal(invalid.posts().length, 2);
});

test("development builds store choices but never collect or send", async (t) => {
  const h = harness(t, { allowed: false });
  h.env.start();
  h.env.setGroup("locale", false);
  await h.env.check("due");
  assert.equal(h.timers.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.collected.length, 0);
  assert.deepEqual(h.env.status(), { available: false, groups: { locale: false, keyboard: true, device: true, app: true, network: true } });
});

test("enforces the contract limits so a weird machine never produces a refused report", () => {
  const long = (char, count) => char.repeat(count);
  const groups = normalizeGroups({
    locale: {
      ui_language: "en_US.UTF-8",
      preferred_languages: [...Array.from({ length: 30 }, (_, index) => `x-lang${index}`), "en-US", "en-US"],
      regional_format: long("a", 40),
      timezone: "Europe/Moscow; DROP",
      utc_offset_minutes: 2000,
      extra: "field",
    },
    keyboard: {
      layouts: [
        ...Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, name: long("я", 200), language: "ru", secret: "x" })),
      ],
      current: long("z", 300),
    },
    device: {
      os: "plan9",
      os_name: `  Windows\t11   ${long("x", 100)}`,
      arch: "x86-64",
      cpu_model: long("c", 500),
      cpu_cores: 4096,
      ram_bytes: 2 ** 60,
      gpus: [{ vendor: "nameless" }, ...Array.from({ length: 12 }, (_, index) => ({ name: `GPU ${index}`, driver_version: long("9", 100), pci: "x" }))],
      displays: [{ width: 0, height: 100 }, ...Array.from({ length: 20 }, () => ({ width: 99_999, height: 1080.4, scale_factor: 20, primary: "yes" }))],
      hostname: "DESKTOP-SECRET",
    },
    app: {
      app_version: "development-0123456789abcdef0123456789",
      runtimes: [{ name: "Claw Browser", version: "1" }, ...Array.from({ length: 20 }, (_, index) => ({ name: `rt${index}`, version: long("1", 100) }))],
      agents: ["claude", "claude", "Codex", "my agent", ...Array.from({ length: 20 }, (_, index) => `agent${index}`)],
      multilogin_connected: "true",
      workspaces_count: 5_000_000,
      profiles_count: -1,
    },
    network: { country: "DE" },
  }, GROUPS, "linux");
  const body = { install_id: INSTALL_ID, groups };
  assertContract(body);
  assert.equal(groups.locale.ui_language, undefined, "the collector normalizes tags; the wire check only accepts valid ones");
  assert.equal(groups.locale.preferred_languages.length, 20);
  assert.equal(groups.locale.regional_format, undefined);
  assert.equal(groups.locale.timezone, undefined);
  assert.equal(groups.locale.utc_offset_minutes, 840);
  assert.equal(groups.keyboard.layouts.length, 32);
  assert.equal(groups.device.os, "linux", "an unknown OS family falls back to the platform");
  assert.equal(groups.device.os_name.startsWith("Windows 11 x"), true);
  assert.equal(normalizeGroups({ device: { cpu_model: "Intel\u0085(R)\u0000 Core" } }, ["device"], "win32").device.cpu_model, "Intel (R) Core", "control characters become spaces");
  assert.equal(groups.device.arch, undefined);
  assert.equal(groups.device.cpu_cores, 1024);
  assert.equal(groups.device.ram_bytes, 2 ** 50);
  assert.equal(groups.device.gpus.length, 8);
  assert.equal(groups.device.gpus[0].name, "GPU 0", "a GPU without a name is dropped");
  assert.equal(groups.device.displays.length, 16);
  assert.deepEqual(groups.device.displays[0], { width: 32768, height: 1080, scale_factor: 8 });
  assert.equal(groups.app.runtimes.length, 16);
  assert.equal(groups.app.runtimes[0].name, "rt0");
  assert.deepEqual(groups.app.agents.slice(0, 2), ["claude", "agent0"]);
  assert.equal(groups.app.agents.length, 16);
  assert.equal(groups.app.multilogin_connected, undefined);
  assert.equal(groups.app.workspaces_count, 1_000_000);
  assert.equal(groups.app.profiles_count, undefined);
  assert.deepEqual(groups.network, {});
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 64 * 1024, "a maximal report fits the 64 KiB body limit");
  assert.equal(LIMITS.layouts, 32);
});

test("an enabled group is always present, even when its collector produced nothing", () => {
  const groups = normalizeGroups({ keyboard: null, device: "broken" }, ["keyboard", "device", "network"], "darwin");
  assert.deepEqual(groups, { keyboard: {}, device: { os: "macos" }, network: {} });
});
