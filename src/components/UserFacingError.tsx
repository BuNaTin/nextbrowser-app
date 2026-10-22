import { useEffect } from "react";
import { discordUrl } from "../constants";
import { trackEvent } from "../lib/analytics";
import { reportUserFacingMessage } from "../lib/errorReporting";
import { needsSupportLink } from "../lib/userFacingError";

export function UserFacingError({
  message,
  surface,
  discordLabel,
}: {
  message: string;
  surface: string;
  /** Always link to Discord with this label, e.g. when the fix lives there. */
  discordLabel?: string;
}) {
  const supportRef = needsSupportLink(message);
  const label = discordLabel ?? (supportRef ? "Get help in Discord." : undefined);
  // A message with a Ref is an internal error the user is looking at. It is
  // reported by its surface, error code and Ref, once per Ref; the text, which
  // in a chat turn holds the agent's output, never is.
  useEffect(() => {
    if (supportRef) reportUserFacingMessage(surface.replace(/_/g, "-"), message);
  }, [supportRef, surface, message]);
  return (
    <span className="user-facing-error">
      <span>{message}</span>
      {label && (
        <>
          {" "}
          <a
            href={discordUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackEvent("internal_error_support_opened", { surface })}
          >
            {label}
          </a>
        </>
      )}
    </span>
  );
}
