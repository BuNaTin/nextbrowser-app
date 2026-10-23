import { describe, expect, it } from "vitest";
import { feedbackErrorMessage } from "./feedbackError";

const ipc = (message: string) => new Error(`Error invoking remote method 'nextbrowser:invoke': Error: ${message}`);

describe("feedback send errors", () => {
  it("says the feedback service failed instead of a project sync", () => {
    expect(feedbackErrorMessage(ipc("Project sync failed (503).")))
      .toBe("The feedback service is not responding right now. Please try again in a few minutes.");
    expect(feedbackErrorMessage(ipc("Project sync failed (409)."))).toBe("We couldn't send your feedback. Please try again.");
  });

  it("keeps the reasons the user can act on, without the IPC prefix", () => {
    expect(feedbackErrorMessage(ipc("Sign in to your Nextbrowser account before sending feedback.")))
      .toBe("Sign in to your Nextbrowser account before sending feedback.");
    expect(feedbackErrorMessage(ipc("Nextbrowser could not connect to the service. Check your internet connection and try again.")))
      .toBe("Nextbrowser could not connect to the service. Check your internet connection and try again.");
    expect(feedbackErrorMessage(ipc("Feedback is limited to 2,000 characters."))).toBe("Feedback is limited to 2,000 characters.");
  });

  it("falls back to a plain sentence", () => {
    expect(feedbackErrorMessage(undefined)).toBe("We couldn't send your feedback. Please try again.");
    expect(feedbackErrorMessage(ipc(""))).toBe("We couldn't send your feedback. Please try again.");
  });
});
