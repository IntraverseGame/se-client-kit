// W-49f: no lobby or deposit while a start or cash-out call is in flight
// (decided 2026-10-19): leaving would end the session before the call's
// answer. The plan offers nothing while `calling`; the wired UI hides both
// controls from the player's click until the answer is shown, and "check
// again", a read only, hides nothing.

import { describe, expect, it } from "vitest";

import { buttonNamed, linkNamed, STANDALONE } from "./fixtures/app.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { round, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";
import { linkPlan } from "./operator-links.ts";
import { initialState } from "./wrapper-state.ts";

const m = messagesFor("en").messages;

const controls = (host: HTMLElement): readonly boolean[] => [
  linkNamed(host, m["action.lobby"]) !== undefined,
  linkNamed(host, m["action.deposit"]) !== undefined,
];

describe("no lobby or deposit while a call is in flight (W-49f)", () => {
  it("the plan offers nothing while calling, at idle or beside a result", () => {
    const { blocking: _loading, ...unblocked } = initialState;
    for (const vector of ["coinflip-idle", "coinflip-won"]) {
      const state = { ...unblocked, snapshot: snapshotVector(vector) };
      expect(linkPlan(state, STANDALONE, true)).toEqual({});
      expect(linkPlan(state, STANDALONE).deposit).toBeDefined();
    }
  });

  it("a start hides both from the click until its answer is shown", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.answerStart(snapshotRead("coinflip-idle"));
    });
    expect(controls(ui.host)).toEqual([true, true]);
    buttonNamed(ui.host, m["action.start"])?.click();
    // The click's call is in flight: nothing to leave by.
    expect(controls(ui.host)).toEqual([false, false]);
    await ui.settle();
    expect(ui.fake.starts).toHaveLength(1);
    expect(controls(ui.host)).toEqual([true, true]);
  });

  it("the app's in-flight signal hides both and gives them back", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-won"));
    });
    expect(controls(ui.host)).toEqual([true, true]);
    ui.app.callInFlight(true);
    expect(controls(ui.host)).toEqual([false, false]);
    ui.app.callInFlight(false);
    expect(controls(ui.host)).toEqual([true, true]);
  });

  it("a cash-out signals its call, and its won answer offers both again", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-active"));
      fake.setRound(round({ cashOutOffered: true }));
      fake.answerCashOut(snapshotRead("coinflip-won"));
    });
    buttonNamed(ui.host, m["action.cashOut"])?.click();
    expect(controls(ui.host)).toEqual([false, false]);
    ui.fake.setRound(undefined);
    await ui.settle();
    expect(ui.fake.cashOuts()).toBe(1);
    expect(controls(ui.host)).toEqual([true, true]);
  });
});
