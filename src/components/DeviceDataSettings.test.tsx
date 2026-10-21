import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEVICE_DATA_GROUPS, PRIVACY_POLICY_URL, deviceDataAppSetup, type DeviceDataStatus } from "../lib/deviceData";
import { DeviceDataGroups } from "./DeviceDataSettings";

const status = (groups: Partial<DeviceDataStatus["groups"]> = {}, available = true): DeviceDataStatus => ({
  available,
  groups: { locale: true, keyboard: true, device: true, app: true, network: true, ...groups },
});

describe("DeviceDataGroups", () => {
  it("shows one labelled toggle per group with its summary, the deletion note and the Privacy Policy", () => {
    const html = renderToStaticMarkup(<DeviceDataGroups status={status({ keyboard: false })} onChange={() => undefined} />);

    expect(DEVICE_DATA_GROUPS.map((group) => group.label)).toEqual([
      "Language and region",
      "Keyboard layouts",
      "Device",
      "App setup",
      "Network location",
    ]);
    for (const group of DEVICE_DATA_GROUPS) {
      expect(html).toContain(`aria-label="Send ${group.label.toLowerCase()} data"`);
      expect(html).toContain(group.summary);
    }
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html.match(/checked=""/g)).toHaveLength(4);
    expect(html).toMatch(/aria-label="Send keyboard layouts data"(?![^>]*checked)/);
    expect(html).toContain("Turning a group off also deletes what was stored for it.");
    expect(html).toContain(`href="${PRIVACY_POLICY_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("does not send");
  });

  it("says when this build does not send device data", () => {
    const html = renderToStaticMarkup(<DeviceDataGroups status={status({}, false)} onChange={() => undefined} />);
    expect(html).toContain("This build does not send device data.");
  });
});

describe("deviceDataAppSetup", () => {
  const loaded = {
    authed: true,
    workspacesLoaded: true,
    profilesLoaded: true,
    runtime: {
      codex: { ready: true, loggedIn: true },
      claude: { ready: true, loggedIn: null },
      gemini: { ready: true, loggedIn: false },
      hermes: { ready: false },
    },
    workspaces: [{ name: "Client A" }, { name: "Client B" }],
    profiles: [{ name: "shop-us" }],
  };

  it("reports connected agent types and counts, never names", () => {
    expect(deviceDataAppSetup(loaded)).toEqual({ agents: ["claude", "codex"], workspaces: 2, profiles: 1 });
    expect(JSON.stringify(deviceDataAppSetup(loaded))).not.toMatch(/Client|shop/);
  });

  it("waits until the user is signed in and the lists are loaded", () => {
    expect(deviceDataAppSetup({ ...loaded, authed: false })).toBeUndefined();
    expect(deviceDataAppSetup({ ...loaded, workspacesLoaded: false })).toBeUndefined();
    expect(deviceDataAppSetup({ ...loaded, profilesLoaded: false })).toBeUndefined();
  });
});
