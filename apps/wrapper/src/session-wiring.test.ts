// The session's wiring into the UI (W-1a, W-2, W-14, W-22, W-24, W-26, W-31,
// W-44): what opening the session shows, the shell's checks of the round
// (verifying, ready, failed, out of sync), and the start and cash-out intents.
// The session is a scripted stand-in (fixtures/fake-session.ts).

import type { RoundState, SessionOpening } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import {
  alertText,
  allText,
  buttonNamed,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import {
  createFakeSession,
  snapshotRead,
  validSnapshot,
} from "./fixtures/fake-session.ts";
import { ACTIVE, gameShown, round, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";
import { showOpening } from "./session-wiring.ts";

const m = messagesFor("en").messages;

describe("opening the session (W-1a, W-2, W-14)", () => {
  it.each<[SessionOpening["kind"], string]>([
    ["no-launch-code", m["state.sessionEnded"]],
    ["redeem-failed", m["state.sessionEnded"]],
    ["other-tab", m["state.otherTab"]],
    ["unsupported", m["state.unsupported"]],
  ])("%s shows its state and opens nothing", (kind, heading) => {
    const ui = mount();
    const opening = { kind } as SessionOpening;
    expect(showOpening(ui.app, opening)).toBeUndefined();
    expect(allText(ui.host)).toContain(heading);
  });

  it("the session-ended state says how to play again", () => {
    const ui = mount();
    showOpening(ui.app, { kind: "no-launch-code" });
    expect(allText(ui.host)).toContain(m["state.sessionEndedDetail"]);
  });

  it("an open session is returned", () => {
    const fake = createFakeSession();
    expect(
      showOpening(mount().app, { kind: "open", session: fake.session }),
    ).toBe(fake.session);
  });
});

describe("the shell's checks of the round (W-26, W-31, W-44)", () => {
  it("an active round still being checked is not shown as ready", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round({ verdict: "checking" }));
    });
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
    expect(allText(ui.host)).toContain(m["detail.verifying"]);
    expect(gameShown(ui)).toBe(false);
  });

  it("an active round that passed is shown ready, with the game", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round());
    });
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
    expect(gameShown(ui)).toBe(true);
  });

  it("a round the shell does not hold is shown, with no game and no control", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
    });
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
    expect(gameShown(ui)).toBe(false);
    expect(buttonNamed(ui.host, m["action.cashOut"])).toBeUndefined();
  });

  it.each<[NonNullable<RoundState["shown"]>, string]>([
    ["verification-failed", m["state.verificationFailed"]],
    ["chain-unverified", m["state.chainUnverified"]],
  ])("a %s round shows its state, not the game", async (shown, heading) => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round({ verdict: "failed", shown }));
    });
    expect(alertText(ui.host)).toContain(heading);
    expect(gameShown(ui)).toBe(false);
  });

  it("an out-of-sync round shows its state (W-19)", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round({ outOfSync: true }));
    });
    expect(alertText(ui.host)).toContain(m["state.outOfSync"]);
  });
});

describe("the intents (W-22, W-24)", () => {
  it("start sends the Snapshot's own Amount fields as the bet", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.answerStart(snapshotRead("coinflip-starting"));
    });
    buttonNamed(ui.host, m["action.start"])?.click();
    await ui.settle();
    const { defaultBet } = validSnapshot("coinflip-idle").bet;
    expect(ui.fake.starts).toEqual([
      {
        value: defaultBet.value,
        unit: defaultBet.unit,
        decimals: defaultBet.decimals,
      },
    ]);
    expect(statusHeading(ui.host)).toBe(m["status.starting"]);
  });

  it("offers cash-out only when the shell does, and sends it on request", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round({ cashOutOffered: true }));
      fake.answerCashOut(snapshotRead("coinflip-won"));
    });
    expect(ui.fake.cashOuts()).toBe(0);
    buttonNamed(ui.host, m["action.cashOut"])?.click();
    await ui.settle();
    expect(ui.fake.cashOuts()).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
  });

  it("a second cash-out while one is in flight does nothing", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round({ cashOutOffered: true }));
      fake.answerCashOut(snapshotRead("coinflip-won"));
    });
    const cashOut = buttonNamed(ui.host, m["action.cashOut"]);
    cashOut?.click();
    cashOut?.click();
    await ui.settle();
    expect(ui.fake.cashOuts()).toBe(1);
  });

  it("a second start while one is in flight does nothing", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.answerStart(snapshotRead("coinflip-starting"));
    });
    const start = buttonNamed(ui.host, m["action.start"]);
    start?.click();
    start?.click();
    await ui.settle();
    expect(ui.fake.starts).toHaveLength(1);
  });

  it("offers no cash-out when the shell does not", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round());
    });
    expect(buttonNamed(ui.host, m["action.cashOut"])).toBeUndefined();
  });

  it("a refused action shows the generic error", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.answerStart({ kind: "refused", reason: "invalid-input" });
    });
    buttonNamed(ui.host, m["action.start"])?.click();
    await ui.settle();
    expect(alertText(ui.host)).toContain(m["error.generic"]);
  });

  it("a lost signer lock shows the other-tab state (W-14)", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.answerStart({ kind: "refused", reason: "lock-not-held" });
    });
    buttonNamed(ui.host, m["action.start"])?.click();
    await ui.settle();
    expect(allText(ui.host)).toContain(m["state.otherTab"]);
  });
});
