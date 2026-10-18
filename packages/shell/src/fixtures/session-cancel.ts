// Test-only: a session whose round fails only its tip check (its RPC
// endpoints disagree), so the round's cancel is required (W-25, W-26), with
// the game mounted; the Snapshots the cancel tests answer with; and what they
// check: that nothing new is signed or sent, and what the game was sent.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { expect } from "vitest";

import type { PlaySession, SessionRead } from "../session-types.ts";
import { action, createFakeGame, HELLO, mountOf } from "./fake-game.ts";
import { ok } from "./fake-play.ts";
import { open, sessionOf, settleMany } from "./play-session.ts";
import { asStarting, ROUND_REQUEST } from "./round-auth.ts";
import { reread } from "./round-edits.ts";
import { disagreeingRpc, issued } from "./session-round.ts";
import { OTHER_ROUND_ID, snapshot, validated } from "./vectors.ts";

export const roundId: string = issued.snapshot.roundId ?? "";

export const starting = (): ValidSnapshot =>
  reread(issued.snapshot, asStarting);
export const resolving = (): ValidSnapshot =>
  reread(issued.snapshot, p => (p.input["status"] = "resolving"));
export const canceled = (): ValidSnapshot =>
  reread(issued.snapshot, p => {
    p.input["status"] = "canceled";
    p.input["step"] = 0;
  });
/** A Snapshot read after the round's, so the game's bridge would take it. */
export const later = (read: ValidSnapshot): ValidSnapshot =>
  validated({ ...read, version: issued.snapshot.version + 100 });
export const otherRound = (): ValidSnapshot =>
  later(snapshot("active", { roundId: OTHER_ROUND_ID }));
export const idle = (): ValidSnapshot => later(snapshot("idle"));

export const ROUND_EXISTS = {
  kind: "refused",
  reason: "round-exists",
} as const;

export type Held = Awaited<ReturnType<typeof open>> & {
  readonly session: PlaySession;
  readonly game: ReturnType<typeof createFakeGame>;
};

/**
 * A session whose RPC endpoints disagree (every round fails its tip check),
 * with the game mounted and no round yet.
 */
export const mounted = async (): Promise<Held> => {
  const opened = await open({ rpc: disagreeingRpc });
  const session = sessionOf(opened);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  return { ...opened, session, game };
};

/** A session whose round failed its tip check, with the game mounted. */
export const failedRound = async (first: ValidSnapshot): Promise<Held> => {
  const held = await mounted();
  held.play.answer("startRound", ok(first));
  await held.session.start(ROUND_REQUEST.bet);
  expect(held.session.round()).toMatchObject({
    verdict: "failed",
    shown: "verification-failed",
  });
  return held;
};

/** A failed round whose cancel the start already signed, settling. */
export const settlingRound = async (): Promise<Held> => {
  const opened = await open({ rpc: disagreeingRpc });
  opened.play.answer("cancelRound", ok(resolving()));
  opened.play.answer("getSnapshot", ok(resolving()));
  const session = sessionOf(opened);
  const game = createFakeGame();
  expect(session.mountGame(mountOf(game)).ok).toBe(true);
  game.send(HELLO);
  opened.play.answer("startRound", ok(issued.snapshot));
  await session.start(ROUND_REQUEST.bet);
  expect(session.round()?.cancel).toBe("settling");
  return { ...opened, session, game };
};

/** The statuses of the Snapshots the game was sent, in order. */
export const gameStatuses = (held: Held): string[] =>
  held.game.posted.flatMap(({ message }) => {
    const sent = message as {
      readonly type?: string;
      readonly snapshot?: { readonly status?: string };
    };
    return sent.type === "snapshot" ? [sent.snapshot?.status ?? ""] : [];
  });

/** A read answer's Snapshot status and round, for comparison. */
export const shownBy = (
  read: SessionRead,
): { readonly status?: string; readonly roundId?: string } =>
  read.kind === "snapshot"
    ? { status: read.snapshot.status, roundId: read.snapshot.roundId ?? "" }
    : {};

/** Nothing new is signed or sent: no pick, cash-out, start, or cancel. */
export const nothingSigned = async (held: Held): Promise<void> => {
  const calls = held.play.all().length;
  const cancels = held.play.sent("cancelRound").length;
  expect(await held.session.cashOut()).toMatchObject({ kind: "refused" });
  held.game.send(action("p1", 0, 1));
  await settleMany();
  expect(held.game.posted.at(-1)?.message).toMatchObject({
    type: "reject",
    id: "p1",
  });
  expect(await held.session.start(ROUND_REQUEST.bet)).toEqual(ROUND_EXISTS);
  expect(held.play.sent("continueRound")).toHaveLength(0);
  expect(held.play.sent("cashOutRound")).toHaveLength(0);
  expect(held.play.sent("startRound")).toHaveLength(1);
  expect(held.play.sent("cancelRound")).toHaveLength(cancels);
  expect(held.play.all()).toHaveLength(calls);
};
