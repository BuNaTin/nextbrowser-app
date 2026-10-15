import { describe, expect, it } from "vitest";
import { profileRowStatusText } from "./profileRowStatus";

describe("profile row status text", () => {
  it("names the project using the profile without repeating the In use badge", () => {
    const text = profileRowStatusText({ status: "running", ip: "203.0.113.7", occupiedBy: "Check GitHub star" });

    expect(text).toBe("Check GitHub star");
    expect(text).not.toMatch(/in use/i);
  });

  it("shows the session state and exit IP of a profile no other project uses", () => {
    expect(profileRowStatusText({ status: "running", ip: "203.0.113.7" })).toBe("running · 203.0.113.7");
    expect(profileRowStatusText({ status: "stopped" })).toBe("stopped");
    expect(profileRowStatusText({ status: "starting", ip: "203.0.113.7" })).toBe("Starting and verifying");
  });

  it("keeps an explicit status line", () => {
    expect(profileRowStatusText({ status: "Running", occupiedBy: "Other", metaOverride: "Running · Cloud phone" })).toBe("Running · Cloud phone");
  });
});
