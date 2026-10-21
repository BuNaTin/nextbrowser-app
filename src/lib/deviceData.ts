// Renderer half of device data. The main process stores each group's choice,
// collects the groups that are on and sends them for the signed-in account
// (electron/client-environment.cjs). The renderer only shows the choices and
// tells the main process what it alone knows: which agent types are connected
// and how many workspaces and profiles there are — never their names.

export type DeviceDataGroup = "locale" | "keyboard" | "device" | "app" | "network";

export interface DeviceDataStatus {
  /** False in development builds, which do not send device data. */
  available: boolean;
  groups: Record<DeviceDataGroup, boolean>;
}

export interface DeviceDataGroupInfo {
  key: DeviceDataGroup;
  label: string;
  /** One line under the label. */
  summary: string;
  /** Everything the group sends, as a tooltip. */
  detail: string;
}

export const PRIVACY_POLICY_URL = "https://nextbrowser.com/privacy-policy";

export const DEVICE_DATA_GROUPS: DeviceDataGroupInfo[] = [
  {
    key: "locale",
    label: "Language and region",
    summary: "OS languages, regional format, time zone",
    detail: "OS interface language, preferred languages, regional format, time zone and UTC offset.",
  },
  {
    key: "keyboard",
    label: "Keyboard layouts",
    summary: "Installed and default layouts, never keystrokes",
    detail: "Keyboard layouts installed in the OS settings and the default one. Never keystrokes or typed text.",
  },
  {
    key: "device",
    label: "Device",
    summary: "OS version, CPU, memory, GPUs, displays",
    detail: "OS name, version and build, architecture, CPU model and cores, memory size, GPUs, and display resolution and scale.",
  },
  {
    key: "app",
    label: "App setup",
    summary: "Versions, agent types, Multilogin, counts",
    detail: "App, nbc and browser runtime versions, which agent types are connected, whether Multilogin is connected, and how many workspaces and profiles you have. Never their names.",
  },
  {
    key: "network",
    label: "Network location",
    summary: "Country, city and provider from your IP",
    detail: "Country, region, city and internet provider, looked up by Nextbrowser from the address your reports come from. The IP address itself is not stored.",
  },
];

interface AppSetupSource {
  authed: boolean;
  workspacesLoaded: boolean;
  profilesLoaded: boolean;
  runtime: Record<string, { ready?: boolean; loggedIn?: boolean | null }>;
  workspaces: unknown[];
  profiles: unknown[];
}

export interface DeviceDataAppSetup {
  agents: string[];
  workspaces: number;
  profiles: number;
}

/**
 * What the App setup group needs from the renderer, once the account's
 * workspaces and this computer's profiles are loaded. Undefined while signed
 * out or still loading.
 */
export function deviceDataAppSetup(state: AppSetupSource): DeviceDataAppSetup | undefined {
  if (!state.authed || !state.workspacesLoaded || !state.profilesLoaded) return undefined;
  const agents = Object.entries(state.runtime)
    .filter(([, runtime]) => runtime?.ready && runtime.loggedIn !== false)
    .map(([id]) => id)
    .sort();
  return { agents, workspaces: state.workspaces.length, profiles: state.profiles.length };
}
