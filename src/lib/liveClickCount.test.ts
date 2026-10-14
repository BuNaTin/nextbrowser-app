import { expect, it } from "vitest";
import { nextLiveClick } from "./liveClickCount";

it("counts double and triple clicks at the same spot", () => {
  const first = nextLiveClick(undefined, { time: 0, x: 10, y: 10, button: "left" });
  const second = nextLiveClick(first, { time: 200, x: 11, y: 10, button: "left" });
  const third = nextLiveClick(second, { time: 380, x: 11, y: 11, button: "left" });
  expect([first.count, second.count, third.count]).toEqual([1, 2, 3]);
});

it("starts a new click after a pause, a move, or another button", () => {
  const first = nextLiveClick(undefined, { time: 0, x: 10, y: 10, button: "left" });
  expect(nextLiveClick(first, { time: 900, x: 10, y: 10, button: "left" }).count).toBe(1);
  expect(nextLiveClick(first, { time: 100, x: 60, y: 10, button: "left" }).count).toBe(1);
  expect(nextLiveClick(first, { time: 100, x: 10, y: 10, button: "right" }).count).toBe(1);
});
