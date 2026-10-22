import { beforeEach, expect, it, vi } from "vitest";
import type { SkillEntry } from "./skillsCatalog";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  prepareSession: vi.fn(),
  open: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock("./electronBridge", () => ({ invoke: mocks.invoke, listen: vi.fn(), filePathForFile: () => "" }));
vi.mock("./preflight", () => ({ prepareSession: mocks.prepareSession, tidyEngineTabs: vi.fn() }));
vi.mock("./lib/xreply/browser", () => ({ cliBrowser: () => ({ open: mocks.open, evaluate: mocks.evaluate }) }));
vi.mock("./lib/analytics", () => ({ setAnalyticsUserId: vi.fn(), trackEvent: vi.fn(), trackScreenView: vi.fn(), trackTiming: vi.fn() }));

const siteSkill: SkillEntry = {
  id: "repository:site",
  title: "Site",
  subtitle: "example.com",
  selector: { kind: "domain", value: "example.com" },
  category: "social",
  categoryTitle: "Social",
  categoryIcon: "globe",
  categoryOrder: 1,
  watchlist: {
    title: "Watched accounts",
    placeholder: "account",
    signIn: { url: "https://example.com/home", probe: "({ signed_in: true })" },
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(null);
  mocks.prepareSession.mockReset();
  mocks.prepareSession.mockResolvedValue({ profileArgs: ["--profile", "qa"] });
  mocks.open.mockReset();
  mocks.open.mockResolvedValue(undefined);
  mocks.evaluate.mockReset();
  mocks.evaluate.mockResolvedValue({ signed_in: true, handle: "me" });
});

it("keeps a failed Check on the panel after the check ends", async () => {
  const { useStore } = await import("./store");
  mocks.prepareSession.mockRejectedValue(new Error("Could not start Nextbrowser: the runtime is missing."));

  expect(await useStore.getState().checkWatchlistSignIn(siteSkill)).toBe(false);

  expect(useStore.getState()).toMatchObject({
    watchlistBusy: undefined,
    watchlistStepFor: siteSkill.id,
    watchlistStep: "Could not start Nextbrowser: the runtime is missing.",
  });
});

it("keeps a failed Open on the panel and does not check the account", async () => {
  const { useStore } = await import("./store");
  mocks.open.mockRejectedValue(new Error("The page could not be opened."));

  await useStore.getState().openWatchlistSite(siteSkill);

  expect(useStore.getState()).toMatchObject({ watchlistBusy: undefined, watchlistStepFor: siteSkill.id, watchlistStep: "The page could not be opened." });
  expect(mocks.evaluate).not.toHaveBeenCalled();
});

it("clears the progress line when Open and Check succeed, leaving the account status", async () => {
  const { useStore } = await import("./store");

  await useStore.getState().openWatchlistSite(siteSkill);

  expect(useStore.getState().watchlistStep).toBeUndefined();
  expect(useStore.getState().watchlistBusy).toBeUndefined();
  expect(useStore.getState().watchlistSignIns[siteSkill.id]).toMatchObject({ signedIn: true, handle: "me" });
});
