import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The tests run without a DOM, so the component is called as a function and
// its effect runs at once, as it would after each mount.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void) => { effect(); },
}));

import { resetErrorReportingForTests, type RendererErrorReport } from "../lib/errorReporting";
import { errorRefsIn, internalError } from "../lib/userFacingError";
import { UserFacingError } from "./UserFacingError";

describe("UserFacingError reports", () => {
  let reports: RendererErrorReport[];

  beforeEach(() => {
    resetErrorReportingForTests();
    reports = [];
    vi.stubGlobal("window", { nextbrowser: { reportError: (report: RendererErrorReport) => reports.push(report) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an internal error it shows by surface, code and Ref", () => {
    const message = internalError("We couldn't sign you out.", "ACCOUNT_SIGN_OUT_FAILED");
    const [ref] = errorRefsIn(message);
    UserFacingError({ message, surface: "account_sign_out" });
    expect(reports).toEqual([{
      kind: "command_failed",
      name: "ACCOUNT_SIGN_OUT_FAILED",
      message: "account-sign-out: ACCOUNT_SIGN_OUT_FAILED",
      context: { surface: "account-sign-out", code: "ACCOUNT_SIGN_OUT_FAILED", ref },
    }]);
  });

  it("reports each Ref once, however often it is shown", () => {
    const message = internalError("We couldn't connect Live View.", "LIVE_VIEW_CONNECT_FAILED");
    UserFacingError({ message, surface: "live_view" });
    UserFacingError({ message, surface: "live_view" });
    UserFacingError({ message, surface: "agent_chat" });
    expect(reports).toHaveLength(1);
    UserFacingError({ message: internalError("We couldn't connect Live View.", "LIVE_VIEW_CONNECT_FAILED"), surface: "live_view" });
    expect(reports).toHaveLength(2);
    expect(reports[0].context?.ref).not.toBe(reports[1].context?.ref);
  });

  it("never sends the text of a chat turn", () => {
    const message = `The page says: card 4111 1111 1111 1111 for alice@example.com\n${internalError("We couldn't start the agent.", "AGENT_START_FAILED")}`;
    UserFacingError({ message, surface: "agent_turn" });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ name: "AGENT_START_FAILED", message: "agent-turn: AGENT_START_FAILED" });
    expect(JSON.stringify(reports)).not.toMatch(/4111|alice|page says/);
  });

  it("reports nothing for input errors and Refs it did not make", () => {
    UserFacingError({ message: "Enter a valid proxy URL.", surface: "manual_proxy" });
    // A message saved before a restart, and a profile failure worded by the main process.
    UserFacingError({ message: "We couldn't start the agent. Ref: NB-6F2C1A9B-04D2", surface: "agent_turn" });
    UserFacingError({ message: "The Work profile couldn't start: proxy. Retry once. Ref: NB-0000ABCD", surface: "agent_turn" });
    expect(reports).toEqual([]);
  });
});
