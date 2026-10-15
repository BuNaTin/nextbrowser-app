import { describe, expect, it } from "vitest";
import {
  clawbrowserTargetKey,
  createLiveStartTurns,
  liveSwitchStartsStream,
  multiloginTargetKey,
} from "./liveProfileSwitch";

const statuses = { work: "running", spare: "stopped" };

describe("Live profile switch", () => {
  it("streams the newly picked running profile while a stream is on", () => {
    expect(liveSwitchStartsStream(true, clawbrowserTargetKey("work"), statuses)).toBe(true);
    expect(liveSwitchStartsStream(true, multiloginTargetKey({ kind: "browser", id: "p1", name: "Work" }), statuses)).toBe(true);
  });

  it("leaves a stopped profile to the Stream button", () => {
    expect(liveSwitchStartsStream(true, clawbrowserTargetKey("spare"), statuses)).toBe(false);
    expect(liveSwitchStartsStream(true, clawbrowserTargetKey("unknown"), statuses)).toBe(false);
    expect(liveSwitchStartsStream(true, "", statuses)).toBe(false);
  });

  it("does not start a stream that was off", () => {
    expect(liveSwitchStartsStream(false, clawbrowserTargetKey("work"), statuses)).toBe(false);
  });
});

describe("Live start turns", () => {
  it("keeps a replaced start's session closed before the next one opens", async () => {
    const takeTurn = createLiveStartTurns();
    const events: string[] = [];
    let generation = 0;
    let finishA!: (id: string) => void;
    const backend = (profile: string) => profile === "a"
      ? new Promise<string>((resolve) => { finishA = resolve; })
      : Promise.resolve(`session-${profile}`);
    const start = async (profile: string) => {
      const mine = ++generation;
      const turn = takeTurn();
      try {
        await turn.ready;
        if (mine !== generation) return;
        events.push(`open ${profile}`);
        const session = await backend(profile);
        if (mine !== generation) {
          events.push(`close ${session}`);
          return;
        }
        events.push(`live ${session}`);
      } finally {
        turn.done();
      }
    };

    const a = start("a");
    await Promise.resolve();
    // Fast switching: b is replaced by c before a's nextctl call returns.
    const b = start("b");
    const c = start("c");
    await Promise.resolve();
    expect(events).toEqual(["open a"]);

    finishA("session-a");
    await Promise.all([a, b, c]);
    expect(events).toEqual(["open a", "close session-a", "open c", "live session-c"]);
  });

  it("lets the next start go once the previous one is done", async () => {
    const takeTurn = createLiveStartTurns();
    const first = takeTurn();
    const second = takeTurn();
    let ready = false;
    void second.ready.then(() => { ready = true; });
    await first.ready;
    await Promise.resolve();
    expect(ready).toBe(false);
    first.done();
    first.done();
    await second.ready;
    expect(ready).toBe(true);
  });
});
