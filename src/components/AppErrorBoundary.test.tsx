import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetErrorReportingForTests, type RendererErrorReport } from "../lib/errorReporting";
import { errorReference } from "../lib/userFacingError";
import { AppErrorBoundary } from "./AppErrorBoundary";

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetErrorReportingForTests();
  });

  it("renders its children while nothing failed", () => {
    expect(renderToStaticMarkup(<AppErrorBoundary><p>app</p></AppErrorBoundary>)).toBe("<p>app</p>");
  });

  it("reports a render error with its component stack and shows a reload screen with the Ref", () => {
    const reports: RendererErrorReport[] = [];
    vi.stubGlobal("window", { nextbrowser: { reportError: (report: RendererErrorReport) => reports.push(report) } });
    const error = new Error("Cannot render ChatView");
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = AppErrorBoundary.getDerivedStateFromError(error);
    boundary.componentDidCatch(error, { componentStack: "\n    at ChatView\n    at App" });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: "react_render",
      name: "Error",
      message: "Cannot render ChatView",
      context: { boundary: "app_root", ref: errorReference("Cannot render ChatView") },
    });
    expect(reports[0].stack).toContain("Component stack:");
    expect(reports[0].stack).toContain("at ChatView");

    const html = renderToStaticMarkup(<>{boundary.render()}</>);
    expect(html).toContain('role="alert"');
    expect(html).toContain(`Ref: ${errorReference("Cannot render ChatView")}`);
    expect(html).toContain("Reload");
  });
});
