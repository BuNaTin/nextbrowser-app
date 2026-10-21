import { Component, type ErrorInfo, type ReactNode } from "react";
import { brandName } from "../constants";
import { describeError, reportRendererError } from "../lib/errorReporting";
import { errorReference } from "../lib/userFacingError";

interface AppErrorBoundaryState {
  reference?: string;
}

/**
 * The last line under the whole app: a render error used to unmount React and
 * leave a blank window. It now shows a reload screen with a Ref and sends the
 * error, with its component stack, as an error report.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { reference: errorReference(describeError(error).message.trim() || "Unknown render error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportRendererError("react_render", error, {
      boundary: "app_root",
      ...(this.state.reference ? { ref: this.state.reference } : {}),
    }, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.reference) return this.props.children;
    return (
      <div className="splash" role="alert">
        <div className="splash-title">{brandName}</div>
        <div className="startup-recovery">
          <p className="muted small">Something went wrong and this window needs to reload. Ref: {this.state.reference}</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
