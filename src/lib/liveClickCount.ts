/**
 * Pointer events report detail = 0, so Live counted every click as a single
 * click and double- or triple-click text selection never reached the remote
 * page. Count consecutive presses like the OS does: same button, close in time
 * and position.
 */
export interface LiveClick {
  time: number;
  x: number;
  y: number;
  button: string;
  count: number;
}

export const LIVE_MULTI_CLICK_MS = 500;
export const LIVE_MULTI_CLICK_DISTANCE = 5;

export function nextLiveClick(previous: LiveClick | undefined, press: Omit<LiveClick, "count">): LiveClick {
  const continues = !!previous
    && previous.button === press.button
    && press.time - previous.time <= LIVE_MULTI_CLICK_MS
    && Math.abs(press.x - previous.x) <= LIVE_MULTI_CLICK_DISTANCE
    && Math.abs(press.y - previous.y) <= LIVE_MULTI_CLICK_DISTANCE;
  return { ...press, count: continues ? Math.min(previous.count + 1, 3) : 1 };
}
