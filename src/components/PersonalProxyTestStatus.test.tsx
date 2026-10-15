import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonalProxyTestStatus } from "./PersonalProxyTestStatus";

describe("PersonalProxyTestStatus", () => {
  it("shows a passed test as visible text, not only in the button tooltip", () => {
    const html = renderToStaticMarkup(<PersonalProxyTestStatus test={{ status: "ok", detail: "Alive · 203.0.113.7 · 412ms" }} />);

    expect(html).toContain("personal-proxy-test-ok");
    expect(html).toContain('role="status"');
    expect(html).toContain("Alive · 203.0.113.7 · 412ms");
  });

  it("shows a failed test with its reason in the error style", () => {
    const html = renderToStaticMarkup(<PersonalProxyTestStatus test={{ status: "fail", detail: "The proxy refused the connection." }} />);

    expect(html).toContain("personal-proxy-test-error");
    expect(html).toContain('role="alert"');
    expect(html).toContain("The proxy refused the connection.");
    expect(html).toContain("press Test to retry");
  });

  it("shows nothing before a result arrives", () => {
    expect(renderToStaticMarkup(<PersonalProxyTestStatus />)).toBe("");
    expect(renderToStaticMarkup(<PersonalProxyTestStatus test={{ status: "testing", detail: "" }} />)).toBe("");
  });
});
