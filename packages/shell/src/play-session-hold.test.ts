// T-26 (W-26, W-38): W-38's hold, applied by the session at its hand-offs to
// the game's bridge. A config round's `active` Snapshot is given only when its
// round is the session's current round with the verdict `ready` and not out
// of sync, evaluated after the round observed it; every other Snapshot is
// given as before, and the bridge's type is unchanged. This file: the release
// to `ready`, the ordering against the tip check, and the transition out of
// `ready`. The rounds the shell does not hold, the mount, and the `hello` are
// play-session-hold-rounds.test.ts's; the rule itself is game-hold.test.ts's.
// Scripted Play API, manual clock, fake locks, a gated RPC transport.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { ControllerBridge } from "./controller-bridge.ts";
import { action } from "./fixtures/fake-game.ts";
import { ok, problem } from "./fixtures/fake-play.ts";
import { settleMany } from "./fixtures/play-session.ts";
import { ROUND_REQUEST } from "./fixtures/round-auth.ts";
import {
  activeCopies,
  at,
  copies,
  gated,
  mounted,
  reissued,
  resolving,
  startingBound,
  startingUnbound,
  V,
  won,
} from "./fixtures/session-hold.ts";
import {
  agreeingRpc,
  disagreeingRpc,
  issued,
} from "./fixtures/session-round.ts";
import { snapshot } from "./fixtures/vectors.ts";

describe("W-38's hold, applied by the session (T-26)", () => {
  it("leaves ControllerBridge's type unchanged: sendSnapshot takes a Snapshot", () => {
    expectTypeOf<ControllerBridge["sendSnapshot"]>().toEqualTypeOf<
      (snapshot: ValidSnapshot) => void
    >();
  });

  it("gives a ready round's active Snapshot to the game", async () => {
    const { session, game, play } = await mounted();
    play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.verdict).toBe("ready");
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });

  it("gives every Snapshot that is not active as before", async () => {
    const { session, game, play } = await mounted();
    play.answer("getSnapshot", ok(snapshot("idle")));
    await session.read();
    play.answer("startRound", ok(startingBound()));
    await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.verdict).toBe("checking");
    expect(copies(game).map(copy => copy.status)).toEqual(["idle", "starting"]);
  });
});

describe("the ordering: the verdict is evaluated after the round observed the Snapshot", () => {
  it("a tip check decided on a bound starting gives the first active Snapshot whose checks pass", async () => {
    const { session, game, play } = await mounted();
    play.answer("startRound", ok(startingBound()));
    await session.start(ROUND_REQUEST.bet);
    // The tip check ran on `starting` and decided; the round is not active.
    expect(session.round()?.verdict).toBe("checking");
    expect(activeCopies(game)).toEqual([]);
    play.answer("getSnapshot", ok(issued.snapshot));
    await session.read();
    expect(session.round()?.verdict).toBe("ready");
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });

  it("an active Snapshot read before the tip check decides is held until it decides ready, then given once", async () => {
    const tip = gated(agreeingRpc);
    const { session, game, play } = await mounted(tip.rpc);
    play.answer("startRound", ok(issued.snapshot));
    const started = session.start(ROUND_REQUEST.bet);
    await settleMany();
    expect(session.round()?.verdict).toBe("checking");
    expect(activeCopies(game)).toEqual([]);
    tip.open();
    expect((await started).kind).toBe("snapshot");
    expect(session.round()?.verdict).toBe("ready");
    // The release: the held Snapshot, never given before, is given once.
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });

  it("an active Snapshot read before the tip check decides stays held when it decides failed", async () => {
    const tip = gated(disagreeingRpc);
    const { session, game, play } = await mounted(tip.rpc);
    play.answer("startRound", ok(issued.snapshot));
    // The required cancel is answered `active`: it did not take (W-25), so the
    // round's latest stays `active`.
    play.answer("cancelRound", ok(at(1)));
    const started = session.start(ROUND_REQUEST.bet);
    await settleMany();
    expect(activeCopies(game)).toEqual([]);
    tip.open();
    await started;
    expect(session.round()).toMatchObject({
      verdict: "failed",
      shown: "verification-failed",
      cancel: "not-taken",
    });
    expect(activeCopies(game)).toEqual([]);
  });

  it("a failed round's resolving is given as usual", async () => {
    const { session, game, play } = await mounted(disagreeingRpc);
    play.answer("startRound", ok(issued.snapshot));
    play.answer("cancelRound", ok(resolving(1)));
    play.answer("getSnapshot", ok(resolving(1)));
    await session.start(ROUND_REQUEST.bet);
    expect(session.round()?.verdict).toBe("failed");
    expect(activeCopies(game)).toEqual([]);
    expect(copies(game).at(-1)).toEqual({
      status: "resolving",
      version: V + 1,
    });
  });

  it("an active Snapshot of a round being checked is held while the verdict is checking", async () => {
    const tip = gated(agreeingRpc);
    const { session, game, play } = await mounted(tip.rpc);
    play.answer("startRound", ok(startingUnbound()));
    await session.start(ROUND_REQUEST.bet);
    play.answer("getSnapshot", ok(issued.snapshot));
    const read = session.read();
    await settleMany();
    expect(session.round()?.verdict).toBe("checking");
    expect(activeCopies(game)).toEqual([]);
    tip.open();
    await read;
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });

  it("overlapping reads give only the round's latest, never a lower version", async () => {
    const tip = gated(agreeingRpc);
    const { session, game, play } = await mounted(tip.rpc);
    play.answer("startRound", ok(startingUnbound()));
    await session.start(ROUND_REQUEST.bet);
    play.answer("getSnapshot", ok(issued.snapshot), ok(at(1)));
    const first = session.read();
    const second = session.read();
    await settleMany();
    expect(activeCopies(game)).toEqual([]);
    tip.open();
    await Promise.all([first, second]);
    const given = activeCopies(game);
    // The same latest may be given twice, which is harmless.
    expect(given.length).toBeGreaterThan(0);
    expect(given.every(copy => copy.version === V + 1)).toBe(true);
  });
});

describe("the transition out of ready", () => {
  it("re-issued: nothing is sent, and no later active Snapshot of the round is given", async () => {
    const { session, game, play } = await mounted();
    play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    const before = game.posted.length;
    play.answer("getSnapshot", ok(reissued()));
    await session.read();
    expect(session.round()).toMatchObject({ verdict: "failed" });
    expect(game.posted).toHaveLength(before);
    play.answer("getSnapshot", ok(at(1, reissued())));
    await session.read();
    expect(game.posted).toHaveLength(before);
    expect(activeCopies(game)).toEqual([{ status: "active", version: V }]);
  });

  it("out of sync: nothing is sent, no later active Snapshot is given, and its result still is", async () => {
    const { session, game, play } = await mounted();
    play.answer("startRound", ok(issued.snapshot));
    await session.start(ROUND_REQUEST.bet);
    // The move is refused 409 `STALE_ACTION`: signing holds (W-19).
    play.answer("continueRound", problem(409, "STALE_ACTION"));
    game.send(action("a1", 0, 1));
    await settleMany();
    const before = activeCopies(game);
    // A read shows the move not applied: the round is out of sync (W-19).
    play.answer("getSnapshot", ok(at(1)));
    await session.read();
    expect(session.round()?.outOfSync).toBe(true);
    play.answer("getSnapshot", ok(at(2)));
    await session.read();
    expect(activeCopies(game)).toEqual(before);
    // Its Snapshots that are not active are given as usual.
    play.answer("getSnapshot", ok(won(3)));
    await session.read();
    expect(copies(game).at(-1)).toEqual({ status: "won", version: V + 3 });
  });
});
