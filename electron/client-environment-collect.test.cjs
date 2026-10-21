const assert = require("node:assert/strict");
const os = require("node:os");
const test = require("node:test");
const {
  createEnvironmentCollector,
  gpuList,
  languageTag,
  macKeyboard,
  parseDefaults,
  parseGsettingsSources,
  parseOsRelease,
  parseSetxkbmap,
  parseSwVers,
  powershellPath,
  windowsKeyboard,
  windowsOs,
} = require("./client-environment-collect.cjs");
const { GROUPS, normalizeGroups } = require("./client-environment.cjs");

// Captured from Windows 11 23H2 (build 22631) by the collector's PowerShell script.
const WINDOWS_REPORT = "{\"keyboard\":{\"default\":\"\",\"layouts\":[{\"language_name\":\"Russian\",\"name\":\"Russian\",\"language\":\"ru\",\"tip\":\"0419:00000419\"},{\"language_name\":\"English\",\"name\":\"US\",\"language\":\"en-US\",\"tip\":\"0409:00000409\"}]},\"gpus\":[{\"device_id\":\"2204\",\"driver_version\":\"32.0.15.9636\",\"name\":\"NVIDIA GeForce RTX 3090\",\"vendor_id\":\"10DE\",\"vendor\":\"NVIDIA\"}],\"os\":{\"ubr\":\"6199\",\"display_version\":\"23H2\",\"build\":\"22631\",\"product\":\"Windows 10 Pro\"}}\r\n";

// `defaults read com.apple.HIToolbox AppleEnabledInputSources` on macOS 15.
const MAC_ENABLED = `(
        {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout ID" = 0;
        "KeyboardLayout Name" = "U.S.";
    },
        {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout ID" = 19458;
        "KeyboardLayout Name" = RussianWin;
    },
        {
        "Bundle ID" = "com.apple.CharacterPaletteIM";
        InputSourceKind = "Non Keyboard Input Method";
    },
        {
        "Bundle ID" = "com.apple.inputmethod.Kotoeri.RomajiTyping";
        InputSourceKind = "Keyboard Input Method";
    },
        {
        "Bundle ID" = "com.apple.inputmethod.Kotoeri.RomajiTyping";
        "Input Mode" = "com.apple.inputmethod.Japanese";
        InputSourceKind = "Input Mode";
    },
        {
        "Bundle ID" = "com.apple.inputmethod.EmojiFunctionRowItem";
        InputSourceKind = "Non Keyboard Input Method";
    }
)
`;
// `defaults read com.apple.HIToolbox AppleSelectedInputSources`.
const MAC_SELECTED = `(
        {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout ID" = 19458;
        "KeyboardLayout Name" = RussianWin;
    },
        {
        "Bundle ID" = "com.apple.PressAndHold";
        InputSourceKind = "Non Keyboard Input Method";
    }
)
`;
const SW_VERS = "ProductName:\t\tmacOS\nProductVersion:\t\t15.6\nBuildVersion:\t\t24G84\n";
const OS_RELEASE = "PRETTY_NAME=\"Ubuntu 24.04.1 LTS\"\nNAME=\"Ubuntu\"\nVERSION_ID=\"24.04\"\nID=ubuntu\n";

function fakeExecFile(outputs, calls = []) {
  return (file, args, options, callback) => {
    calls.push({ file, args, options });
    const key = [file.split(/[\\/]/).pop(), ...args.filter((arg) => !/^[A-Za-z0-9+/=]{200,}$/.test(arg))].join(" ");
    const output = Object.entries(outputs).find(([prefix]) => key.startsWith(prefix))?.[1];
    if (output instanceof Error) callback(output, "", "");
    else if (output === undefined) callback(Object.assign(new Error("not found"), { code: "ENOENT" }), "", "");
    else callback(null, output, "");
  };
}

function fakeApp(overrides = {}) {
  return {
    getPreferredSystemLanguages: () => ["ru-RU", "en-US"],
    getSystemLocale: () => "ru-RU",
    getLocale: () => "ru",
    getGPUInfo: async () => ({ gpuDevice: [{ active: true, vendorId: 0x10de, deviceId: 0x2204, driverVendor: "NVIDIA", driverVersion: "32.0.15.9636" }] }),
    runningUnderARM64Translation: false,
    ...overrides,
  };
}

const fakeScreen = {
  getAllDisplays: () => [
    { id: 7, size: { width: 2560, height: 1440 }, scaleFactor: 1.5 },
    { id: 8, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
  ],
  getPrimaryDisplay: () => ({ id: 7 }),
};

const fakeOs = {
  release: () => "10.0.22631",
  cpus: () => Array.from({ length: 16 }, () => ({ model: "AMD Ryzen 7 5700X 8-Core Processor             " })),
  availableParallelism: () => 16,
  totalmem: () => 50516774912,
};

function decodedScript(call) {
  const encoded = call.args[call.args.indexOf("-EncodedCommand") + 1];
  return Buffer.from(encoded, "base64").toString("utf16le");
}

test("Windows: layouts come from the language list, named by the registry", () => {
  const report = JSON.parse(WINDOWS_REPORT);
  assert.deepEqual(windowsKeyboard(report.keyboard), {
    layouts: [
      { id: "00000419", name: "Russian", language: "ru" },
      { id: "00000409", name: "US", language: "en-US" },
    ],
    current: "00000419",
  });
  // An input method editor keeps its whole tip; a resource reference is not a
  // name; a default input method override wins over the first entry.
  const ime = windowsKeyboard({
    default: "0409:00000409",
    layouts: { tip: "0411:{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}", name: "@%SystemRoot%\\system32\\input.dll,-5000", language: "ja", language_name: "Japanese" },
  });
  assert.deepEqual(ime, {
    layouts: [{ id: "0411:{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}", name: "Japanese", language: "ja" }],
    current: "00000409",
  });
  assert.equal(windowsKeyboard(null), undefined);
});

test("Windows: Windows 11 is named as such, and the build carries its update revision", () => {
  assert.deepEqual(windowsOs(JSON.parse(WINDOWS_REPORT).os, "10.0.22631"), { os_name: "Windows 11 Pro", os_version: "10.0.22631", os_build: "22631.6199" });
  assert.deepEqual(windowsOs({ product: "Windows 10 Home", build: "19045", ubr: "5011" }, "10.0.19045"), { os_name: "Windows 10 Home", os_version: "10.0.19045", os_build: "19045.5011" });
  assert.deepEqual(windowsOs(undefined, "10.0.26100"), { os_name: undefined, os_version: "10.0.26100", os_build: "26100" });
  assert.equal(powershellPath({ SystemRoot: "C:\\Windows" }), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(powershellPath({}), "powershell.exe");
});

test("Windows: one PowerShell call reads only the sections of the groups that are on", async () => {
  const calls = [];
  const collector = createEnvironmentCollector({
    app: fakeApp(),
    screen: fakeScreen,
    platform: "win32",
    arch: "x64",
    env: { SystemRoot: "C:\\Windows" },
    osApi: fakeOs,
    execFileImpl: fakeExecFile({ "powershell.exe -NoProfile -NonInteractive -EncodedCommand": WINDOWS_REPORT }, calls),
    appVersion: "0.2.68",
  });
  const raw = await collector.collect([...GROUPS]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(calls[0].options.windowsHide, true);
  assert.ok(calls[0].options.timeout > 0);
  const script = decodedScript(calls[0]);
  assert.match(script, /Get-WinUserLanguageList/);
  assert.match(script, /Win32_VideoController/);
  assert.doesNotMatch(script, /RegisteredOwner|ComputerName|UserName|\$env:/i, "the script reads nothing that names the user or machine");

  const groups = normalizeGroups(raw, [...GROUPS], "win32");
  assert.deepEqual(groups.keyboard.layouts.map((layout) => layout.name), ["Russian", "US"]);
  assert.deepEqual(groups.device, {
    os: "windows",
    os_name: "Windows 11 Pro",
    os_version: "10.0.22631",
    os_build: "22631.6199",
    arch: "x64",
    cpu_model: "AMD Ryzen 7 5700X 8-Core Processor",
    cpu_cores: 16,
    ram_bytes: 50516774912,
    gpus: [{ name: "NVIDIA GeForce RTX 3090", vendor: "NVIDIA", driver_version: "32.0.15.9636" }],
    displays: [
      { width: 3840, height: 2160, scale_factor: 1.5, primary: true },
      { width: 1920, height: 1080, scale_factor: 1, primary: false },
    ],
  });

  calls.length = 0;
  await collector.collect(["device"]);
  assert.doesNotMatch(decodedScript(calls[0]), /Get-WinUserLanguageList/, "keyboard off: layouts are not read");
  calls.length = 0;
  await collector.collect(["locale", "app", "network"]);
  assert.equal(calls.length, 0, "no PowerShell for groups that do not need it");
});

test("macOS: layouts and input modes come from HIToolbox, the selected one is current", async () => {
  assert.deepEqual(macKeyboard(MAC_ENABLED, MAC_SELECTED), {
    layouts: [
      { id: "keylayout:0", name: "U.S." },
      { id: "keylayout:19458", name: "RussianWin" },
      { id: "com.apple.inputmethod.Japanese", name: "Japanese" },
    ],
    current: "keylayout:19458",
  });
  assert.equal(macKeyboard("", ""), undefined);

  const calls = [];
  const collector = createEnvironmentCollector({
    app: fakeApp({
      getGPUInfo: async () => ({ gpuDevice: [{ active: true, vendorId: 0x106b, deviceId: 0 }] }),
      runningUnderARM64Translation: true,
    }),
    screen: fakeScreen,
    platform: "darwin",
    arch: "x64",
    osApi: { ...fakeOs, release: () => "24.6.0", cpus: () => [{ model: "Apple M2 Pro" }], availableParallelism: () => 12 },
    execFileImpl: fakeExecFile({
      "defaults read com.apple.HIToolbox AppleEnabledInputSources": MAC_ENABLED,
      "defaults read com.apple.HIToolbox AppleSelectedInputSources": MAC_SELECTED,
      "sw_vers": SW_VERS,
    }, calls),
  });
  const groups = normalizeGroups(await collector.collect(["keyboard", "device"]), ["keyboard", "device"], "darwin");
  assert.equal(groups.keyboard.current, "keylayout:19458");
  assert.equal(groups.device.os_name, "macOS 15.6");
  assert.equal(groups.device.os_version, "15.6");
  assert.equal(groups.device.os_build, "24G84");
  assert.equal(groups.device.arch, "arm64", "an x64 build under Rosetta reports the Arm machine");
  assert.deepEqual(groups.device.gpus, [{ name: "Apple M2 Pro", vendor: "Apple" }]);
  assert.ok(calls.every((call) => call.file.startsWith("/usr/bin/")), "system tools by absolute path");
});

test("parses defaults output with quoted, bare and escaped strings", () => {
  assert.deepEqual(parseDefaults('{\n    a = 1;\n    "b c" = "say \\"hi\\"\\U00e9\\n";\n    d = (x, "y z", { e = f; });\n}\n'), {
    a: "1",
    "b c": "say \"hi\"é\n",
    d: ["x", "y z", { e: "f" }],
  });
  assert.equal(parseDefaults("The domain/default pair of (com.apple.HIToolbox, X) does not exist"), undefined);
  assert.deepEqual(parseSwVers(SW_VERS), { ProductName: "macOS", ProductVersion: "15.6", BuildVersion: "24G84" });
});

test("Linux: GNOME input sources first, then setxkbmap", async () => {
  assert.deepEqual(parseGsettingsSources("[('xkb', 'us'), ('xkb', 'ru+phonetic'), ('ibus', 'mozc-jp')]"), [
    { id: "us", name: "us" },
    { id: "ru+phonetic", name: "ru+phonetic" },
    { id: "ibus:mozc-jp", name: "mozc-jp" },
  ]);
  assert.deepEqual(parseGsettingsSources("@a(ss) []"), []);
  assert.deepEqual(parseSetxkbmap("rules:      evdev\nmodel:      pc105\nlayout:     us,ru\nvariant:    ,phonetic\noptions:    grp:alt_shift_toggle\n"), [
    { id: "us", name: "us" },
    { id: "ru(phonetic)", name: "ru(phonetic)" },
  ]);
  assert.deepEqual(parseOsRelease(OS_RELEASE), { PRETTY_NAME: "Ubuntu 24.04.1 LTS", NAME: "Ubuntu", VERSION_ID: "24.04", ID: "ubuntu" });

  const gnome = createEnvironmentCollector({
    app: fakeApp({ getGPUInfo: async () => ({ gpuDevice: [{ vendorId: 0, deviceId: 0 }] }) }),
    platform: "linux",
    osApi: { ...fakeOs, release: () => "6.8.0-45-generic" },
    readFile: async () => OS_RELEASE,
    execFileImpl: fakeExecFile({
      "gsettings get org.gnome.desktop.input-sources sources": "[('xkb', 'us'), ('xkb', 'ru')]\n",
      "gsettings get org.gnome.desktop.input-sources mru-sources": "[('xkb', 'ru'), ('xkb', 'us')]\n",
    }),
  });
  const groups = normalizeGroups(await gnome.collect(["keyboard", "device"]), ["keyboard", "device"], "linux");
  assert.deepEqual(groups.keyboard, { layouts: [{ id: "us", name: "us" }, { id: "ru", name: "ru" }], current: "ru" });
  assert.equal(groups.device.os_name, "Ubuntu 24.04.1 LTS");
  assert.equal(groups.device.os_build, "6.8.0-45-generic");
  assert.equal(groups.device.gpus, undefined, "an unidentified GPU is not reported");

  const xkb = createEnvironmentCollector({ app: fakeApp(), platform: "linux", osApi: fakeOs, execFileImpl: fakeExecFile({ "setxkbmap -query": "layout:     de\n" }) });
  assert.deepEqual((await xkb.collect(["keyboard"])).keyboard, { layouts: [{ id: "de", name: "de" }], current: "de" });
});

test("GPUs are named from the OS where Chromium has no name", () => {
  const windowsGpus = JSON.parse(WINDOWS_REPORT).gpus;
  assert.deepEqual(gpuList({
    info: { gpuDevice: [{ vendorId: 0x10de, deviceId: 0x2204, driverVersion: "32.0.15.9636" }, { vendorId: 0x8086, deviceId: 0x4680, driverVersion: "31.0.101.5186" }] },
    windowsGpus,
    platform: "win32",
  }), [
    { name: "NVIDIA GeForce RTX 3090", vendor: "NVIDIA", driver_version: "32.0.15.9636" },
    { name: "Intel 0x4680", vendor: "Intel", driver_version: "31.0.101.5186" },
  ]);
  assert.deepEqual(gpuList({ info: undefined, windowsGpus, platform: "win32" }), [
    { name: "NVIDIA GeForce RTX 3090", vendor: "NVIDIA", driver_version: "32.0.15.9636" },
  ], "without Chromium's list the OS list is used");
  assert.deepEqual(gpuList({ info: { gpuDevice: [{ vendorId: 0x1002, deviceId: 0x73bf, deviceString: "AMD Radeon RX 6800" }] }, platform: "linux" }), [
    { name: "AMD Radeon RX 6800", vendor: "AMD", driver_version: undefined },
  ]);
});

test("locale: preferred languages, regional format and time zone, with POSIX names cleaned up", async () => {
  assert.equal(languageTag("en_US.UTF-8"), "en-US");
  assert.equal(languageTag("en-US@posix"), "en-US");
  assert.equal(languageTag("C"), undefined);
  assert.equal(languageTag("POSIX"), undefined);
  const collector = createEnvironmentCollector({ app: fakeApp({ getPreferredSystemLanguages: () => ["c"], getLocale: () => "en-US", getSystemLocale: () => "de_DE.UTF-8" }), platform: "linux" });
  const { locale } = await collector.collect(["locale"]);
  assert.equal(locale.ui_language, "en-US", "falls back to the app locale");
  assert.deepEqual(locale.preferred_languages, []);
  assert.equal(locale.regional_format, "de-DE");
  assert.equal(locale.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(locale.utc_offset_minutes, -new Date().getTimezoneOffset());
});

test("app setup: versions, runtimes and Multilogin from the main process, agent types and counts from the renderer", async () => {
  let multilogin = true;
  const collector = createEnvironmentCollector({
    app: fakeApp(),
    platform: "win32",
    appVersion: "0.2.68",
    installedRuntimes: async () => [{ name: "clawbrowser", version: "148.0.7778.97" }, { name: "camoufox" }],
    multiloginConnected: async () => multilogin,
  });
  collector.setNbcVersion("nbc 1.2.37 (a1b2c3d)");
  collector.setNbcVersion("version unavailable");
  collector.setAppSetup({ agents: ["claude", 7, "codex"], workspaces: 3, profiles: 12, workspaceNames: ["Secret"] });
  const groups = normalizeGroups(await collector.collect(["app"]), ["app"], "win32");
  assert.deepEqual(groups.app, {
    app_version: "0.2.68",
    nbc_version: "1.2.37",
    runtimes: [{ name: "clawbrowser", version: "148.0.7778.97" }, { name: "camoufox" }],
    agents: ["claude", "codex"],
    multilogin_connected: true,
    workspaces_count: 3,
    profiles_count: 12,
  });
  multilogin = undefined;
  collector.setAppSetup({});
  const later = normalizeGroups(await collector.collect(["app"]), ["app"], "win32");
  assert.deepEqual(Object.keys(later.app), ["app_version", "nbc_version", "runtimes"], "unknown values are left out, not guessed");
});

test("a command that fails yields less data, never an error, and keeps the last good value", async () => {
  let report = WINDOWS_REPORT;
  const collector = createEnvironmentCollector({
    app: fakeApp({ getGPUInfo: () => { throw new Error("GPU process gone"); } }),
    screen: { getAllDisplays: () => { throw new Error("not ready"); } },
    platform: "win32",
    osApi: fakeOs,
    execFileImpl: (file, args, options, callback) => (report instanceof Error ? callback(report, "", "") : callback(null, report, "")),
  });
  const first = await collector.collect(["keyboard", "device"]);
  assert.equal(first.keyboard.layouts.length, 2);
  report = new Error("powershell is blocked");
  const second = await collector.collect(["keyboard", "device"]);
  assert.deepEqual(second.keyboard, first.keyboard, "the last good layouts are kept for this run");

  const broken = createEnvironmentCollector({ app: {}, platform: "win32", osApi: {}, execFileImpl: () => { throw new Error("spawn EPERM"); } });
  const groups = normalizeGroups(await broken.collect([...GROUPS]), [...GROUPS], "win32");
  assert.deepEqual(groups.keyboard, {});
  assert.equal(groups.device.os, "windows");
});

test("a report from this machine never names the computer, the user or their files", async () => {
  // Real collectors on the machine running the tests, with stand-ins only for
  // the Electron APIs. Whatever the OS answers, the report must not carry the
  // host name, the user name or the home directory.
  const collector = createEnvironmentCollector({
    app: fakeApp({ getGPUInfo: async () => ({ gpuDevice: [] }) }),
    screen: fakeScreen,
    appVersion: "0.2.68",
    installedRuntimes: async () => [{ name: "clawbrowser", version: "148.0.7778.97" }],
  });
  collector.setAppSetup({ agents: ["claude"], workspaces: 1, profiles: 2 });
  const body = JSON.stringify({ install_id: "3f1c2b8e-1d2a-4c55-9b7a-0d6f5e4c3b2a", groups: normalizeGroups(await collector.collect([...GROUPS]), [...GROUPS]) });
  const lower = body.toLowerCase();
  const hostname = os.hostname().toLowerCase();
  const username = os.userInfo().username.toLowerCase();
  const home = os.homedir().toLowerCase();
  if (hostname.length >= 4) assert.ok(!lower.includes(hostname), "no host name");
  if (username.length >= 4) assert.ok(!lower.includes(username), "no user name");
  assert.ok(!lower.includes(home) && !lower.includes(JSON.stringify(home).slice(1, -1)), "no home directory");
  assert.doesNotMatch(body, /[A-Za-z]:\\\\|\/Users\/|\/home\//, "no file paths");
});
