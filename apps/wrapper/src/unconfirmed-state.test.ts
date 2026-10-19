// A move or cash-out not confirmed (W-16): its one resend was lost too, and
// the round is still `active` with the action neither applied nor refused. The
// Wrapper shows "your move (or cash-out) hasn't been confirmed", that the round
// ends by its time limit if it never arrives, the round id, and "check again",
// in place of the round, with the game still shown; it reads the round once
// every 30 s in the background and once per "check again" (one at a time), and
// a read that settles the round replaces the state. The heading is announced
// politely, and takes the focus only after the player's own action (W-46). The
// session is a scripted stand-in (fixtures/fake-session.ts); the clock is the
// manual one.

import type { SessionRead } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { STATUS_HEADING_ID } from "./dom.ts";
import {
  alertText,
  allText,
  buttonNamed,
  liveText,
  statusHeading,
} from "./fixtures/app.ts";
import { readsOver, roundRead } from "./fixtures/cancel.ts";
import { snapshotRead, validSnapshot } from "./fixtures/fake-session.ts";
import {
  ACTIVE,
  activeId,
  gameShown,
  round,
  type Wired,
  wired,
} from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/** The UI on the round `active`, its move or cash-out not confirmed. */
const onUnconfirmed = (
  unconfirmed: "move" | "cash-out" = "move",
): Promise<Wired> =>
  wired(fake => {
    fake.reads.push(snapshotRead(ACTIVE));
    fake.setRound(round({ unconfirmed }));
  });

/** The round won: the move applied. */
const wonRead = (): SessionRead =>
  roundRead(
    {
      ...validSnapshot("coinflip-won"),
      bet: validSnapshot(ACTIVE).bet,
      context: validSnapshot(ACTIVE).context,
    },
    2,
  );

describe("a move or cash-out not confirmed (W-16)", () => {
  it("shows the move not confirmed, the time limit, the round id, and check again, with the game waiting", async () => {
    const ui = await onUnconfirmed();
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    expect(liveText(ui.host)).toBe(m["state.moveUnconfirmed"]);
    expect(allText(ui.host)).toContain(m["state.unconfirmedDetail"]);
    expect(allText(ui.host)).toContain(activeId);
    expect(buttonNamed(ui.host, m["action.checkAgain"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.cashOut"])).toBeUndefined();
    expect(buttonNamed(ui.host, m["action.newRound"])).toBeUndefined();
    expect(allText(ui.host)).not.toContain(m["status.active"]);
    expect(gameShown(ui)).toBe(true);
  });

  it("shows the cash-out not confirmed", async () => {
    const ui = await onUnconfirmed("cash-out");
    expect(statusHeading(ui.host)).toBe(m["state.cashOutUnconfirmed"]);
    expect(allText(ui.host)).toContain(m["state.unconfirmedDetail"]);
    expect(allText(ui.host)).toContain(activeId);
  });

  it("reads once every 30 s in the background, with no taking-longer notice", async () => {
    const ui = await onUnconfirmed();
    expect(await readsOver(ui, 29_900)).toBe(0);
    expect(await readsOver(ui, 200)).toBe(1);
    ui.fake.reads.length = 0;
    ui.fake.reads.push({ kind: "network" });
    expect(await readsOver(ui, 60_000)).toBe(2);
    expect(allText(ui.host)).not.toContain(m["notice.slow"]);
  });

  it("does not poll the active round once it is confirmed", async () => {
    const ui = await onUnconfirmed();
    ui.fake.setRound(round());
    ui.fake.reads.length = 0;
    ui.fake.reads.push(snapshotRead(ACTIVE));
    await readsOver(ui, 30_100);
    expect(statusHeading(ui.host)).toBe(m["status.active"]);
    expect(await readsOver(ui, 120_000)).toBe(0);
  });

  it("reads once per check again, one at a time, and keeps the state while nothing settles", async () => {
    const ui = await onUnconfirmed();
    const check = buttonNamed(ui.host, m["action.checkAgain"]);
    check?.click();
    // A click while that read is in flight does nothing.
    check?.click();
    await ui.settle();
    expect(ui.fake.checks()).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    buttonNamed(ui.host, m["action.checkAgain"])?.click();
    await ui.settle();
    expect(ui.fake.checks()).toBe(2);
  });

  it("shows the result a check again settles on, with the focus on its heading", async () => {
    const ui = await onUnconfirmed();
    ui.fake.setRound(round());
    ui.fake.reads.length = 0;
    ui.fake.reads.push(wonRead());
    buttonNamed(ui.host, m["action.checkAgain"])?.click();
    await ui.settle();
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(allText(ui.host)).not.toContain(m["state.unconfirmedDetail"]);
    const focused = globalThis.document.activeElement;
    expect(focused?.id).toBe(STATUS_HEADING_ID);
    expect(focused?.textContent).toContain(m["status.won"]);
  });

  it("clears on a background read that settles the round, with no focus move", async () => {
    const ui = await onUnconfirmed();
    const outside = globalThis.document.createElement("button");
    globalThis.document.body.append(outside);
    outside.focus();
    ui.fake.setRound(round());
    ui.fake.reads.length = 0;
    ui.fake.reads.push(wonRead());
    expect(await readsOver(ui, 30_100)).toBe(1);
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(globalThis.document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("a typed error beside the state (W-35, W-42)", () => {
  /** A retryable typed error, as a read answers it. */
  const unavailable = {
    kind: "problem",
    problem: { code: "UNAVAILABLE", retryable: true },
  } as SessionRead;

  /** The state, whose next background read gets a typed error. */
  const withTypedError = async (): Promise<Wired> => {
    const ui = await onUnconfirmed();
    ui.fake.reads.length = 0;
    ui.fake.reads.push(unavailable, snapshotRead(ACTIVE));
    expect(await readsOver(ui, 30_100)).toBe(1);
    expect(alertText(ui.host)).toContain(m["error.UNAVAILABLE"]);
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    // The typed error stops the background read.
    expect(await readsOver(ui, 120_000)).toBe(0);
    return ui;
  };

  it("stops the background read until the player tries again", async () => {
    const ui = await withTypedError();
    buttonNamed(ui.host, m["action.retry"])?.click();
    await ui.settle();
    expect(alertText(ui.host)).not.toContain(m["error.UNAVAILABLE"]);
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    expect(await readsOver(ui, 29_900)).toBe(0);
    expect(await readsOver(ui, 200)).toBe(1);
  });

  it("stops the background read until the player checks again", async () => {
    const ui = await withTypedError();
    buttonNamed(ui.host, m["action.checkAgain"])?.click();
    await ui.settle();
    expect(ui.fake.checks()).toBe(1);
    expect(alertText(ui.host)).not.toContain(m["error.UNAVAILABLE"]);
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    expect(await readsOver(ui, 29_900)).toBe(0);
    expect(await readsOver(ui, 200)).toBe(1);
  });
});

describe("the state's focus (W-46)", () => {
  it("moves focus to its heading when it appears on the player's own action, never on a poll", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round());
    });
    const outside = globalThis.document.createElement("button");
    globalThis.document.body.append(outside);
    outside.focus();
    const confirmed = {
      verdict: "ready",
      outOfSync: false,
      cashOutOffered: false,
      cancel: "none",
    } as const;
    const unconfirmed = {
      kind: "snapshot",
      snapshot: validSnapshot(ACTIVE),
      check: { ...confirmed, unconfirmed: "move" },
    } as const;
    ui.app.accept(unconfirmed, "poll");
    expect(statusHeading(ui.host)).toBe(m["state.moveUnconfirmed"]);
    expect(globalThis.document.activeElement).toBe(outside);
    // Back to the round, then the state again on the player's own action.
    ui.app.accept({ ...unconfirmed, check: confirmed }, "poll");
    ui.app.accept(unconfirmed, "player");
    const focused = globalThis.document.activeElement;
    expect(focused?.id).toBe(STATUS_HEADING_ID);
    expect(focused?.textContent).toContain(m["state.moveUnconfirmed"]);
    outside.remove();
  });
});
