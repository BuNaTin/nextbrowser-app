import { describe, expect, it } from "vitest";
import {
  actionFailureMessage,
  agentFailureDetail,
  errorReference,
  internalError,
  needsSupportLink,
} from "./userFacingError";

describe("user-facing internal errors", () => {
  it("never exposes technical error details", () => {
    expect(internalError("We couldn't start Live View.", "LIVE_VIEW_CONNECT_FAILED")).toBe(
      `We couldn't start Live View. Ref: ${errorReference("LIVE_VIEW_CONNECT_FAILED")}`,
    );
  });

  it("does not render untrusted error codes", () => {
    expect(internalError("Failed.", "bad code")).toBe(`Failed. Ref: ${errorReference("INTERNAL_ERROR")}`);
  });

  it("adds support only to internal errors", () => {
    expect(needsSupportLink(internalError("Failed.", "ACTION_FAILED"))).toBe(true);
    expect(needsSupportLink("Enter a valid proxy URL.")).toBe(false);
  });

  it("explains the sanitized reason beside the support reference", () => {
    const message = actionFailureMessage("We couldn't prepare this profile.", "PROFILE_ASSIGNMENT_FAILED", "workspace revision conflict");
    expect(message).toBe(
      "We couldn't prepare this profile. The selected workspace is no longer available. Select or create a workspace, then try again. "
      + `Ref: ${errorReference("PROFILE_ASSIGNMENT_FAILED")}`,
    );
    // The reference the user reported must keep decoding to this action.
    expect(errorReference("PROFILE_ASSIGNMENT_FAILED")).toBe("NB-25647DEA");
  });

  it("explains an Error object from a failed Live View command", () => {
    const message = actionFailureMessage(
      "We couldn't start Live View.",
      "LIVE_VIEW_START_FAILED",
      new Error("detached Remote Control child failed: Proxy traffic limit reached; see log /Users/person/private/child.log"),
    );
    expect(message).toContain("Proxy traffic limit reached. Open Proxy usage to add more traffic, then retry Live View.");
    expect(message).not.toContain("/Users/");
  });

  it("keeps private filesystem locations out of the visible reason", () => {
    const message = actionFailureMessage(
      "We couldn't prepare this profile.",
      "PROFILE_ASSIGNMENT_FAILED",
      "Error invoking remote method 'x': Error: open /Users/someone/secret/workspaces.json failed",
    );
    expect(message).not.toContain("/Users/");
    expect(message).toContain("Ref: NB-25647DEA");
  });

  it("falls back to the bare reference when no reason is available", () => {
    expect(actionFailureMessage("Failed.", "ACTION_FAILED")).toBe(`Failed. Ref: ${errorReference("ACTION_FAILED")}`);
    expect(actionFailureMessage("Failed.", "ACTION_FAILED", "   ")).toBe(`Failed. Ref: ${errorReference("ACTION_FAILED")}`);
  });
});

describe("agent failure detail", () => {
  it("turns the CLI's error line into a sentence", () => {
    expect(agentFailureDetail("ERROR: You've hit your usage limit. Try again later.")).toBe("You've hit your usage limit. Try again later.");
    expect(agentFailureDetail("ERROR: stream disconnected before completion")).toBe("Stream disconnected before completion.");
    expect(agentFailureDetail("API Error: 529 Overloaded")).toBe("API Error: 529 Overloaded.");
    expect(agentFailureDetail("2026-10-23T07:02:11.831641Z ERROR codex_core::client: unexpected status 400 Bad Request"))
      .toBe("codex_core::client: unexpected status 400 Bad Request.");
  });

  it("is empty without a reason", () => {
    expect(agentFailureDetail(undefined)).toBe("");
    expect(agentFailureDetail("ERROR:  ")).toBe("");
  });

  it("keeps the reference after the reason", () => {
    const message = internalError(`Codex stopped unexpectedly. ${agentFailureDetail("ERROR: stream disconnected")}`, "AGENT_STOPPED_UNEXPECTEDLY");
    expect(message).toBe(`Codex stopped unexpectedly. Stream disconnected. Ref: ${errorReference("AGENT_STOPPED_UNEXPECTEDLY")}`);
    expect(needsSupportLink(message)).toBe(true);
  });
});
