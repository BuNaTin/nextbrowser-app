import type { MultiloginProfileSelection } from "./multiloginSelection";

export function clawbrowserTargetKey(profile?: string) {
  return `clawbrowser:${profile || "__default"}`;
}

export function multiloginTargetKey(selection: MultiloginProfileSelection) {
  return `multilogin:${selection.kind}:${selection.id}`;
}

/**
 * Live can stream a target without launching anything first when it is a
 * Multilogin profile (started with Remote Control on demand), the default
 * session, or a profile that is already running. A stopped profile is left to
 * the Stream button, which launches it.
 */
export function liveTargetStreamsWithoutLaunch(key: string, statuses: Readonly<Record<string, string>>): boolean {
  if (key.startsWith("multilogin:")) return true;
  if (!key.startsWith("clawbrowser:")) return false;
  return key === clawbrowserTargetKey() || statuses[key.slice("clawbrowser:".length)] === "running";
}

/**
 * Picking another profile in Live only stopped the stream, so the user had to
 * press Stream again. While a stream is on or connecting, the pick switches it.
 */
export function liveSwitchStartsStream(streaming: boolean, key: string, statuses: Readonly<Record<string, string>>): boolean {
  return streaming && liveTargetStreamsWithoutLaunch(key, statuses);
}

export interface LiveStartTurn {
  /** Resolves once the previous start no longer holds a backend session call. */
  ready: Promise<void>;
  /** Hands the backend to the next start. Safe to call more than once. */
  done: () => void;
}

/**
 * A start replaced by a quick profile switch still owns its backend session
 * until its nextctl call returns and the session is queued for release. Starts
 * take turns so the next one never opens a session next to it, or reuses one
 * the stale start is about to close.
 */
export function createLiveStartTurns(): () => LiveStartTurn {
  let previous: Promise<void> = Promise.resolve();
  return () => {
    const ready = previous;
    let done!: () => void;
    previous = new Promise<void>((resolve) => { done = resolve; });
    return { ready, done };
  };
}
