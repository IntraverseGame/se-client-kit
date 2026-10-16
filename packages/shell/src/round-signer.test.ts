// T-4 (W-15, W-16, W-18): sequence and `previous` chaining, the same bytes and
// idempotency key on a resend, never two actions at one sequence, and `T`
// advancing only on an applied Snapshot.

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import {
  openTestSession,
  openWorkedRound,
  shellCodeOf,
} from "./fixtures/session.ts";
import {
  OTHER_ROUND_ID,
  snapshot,
  workedActions,
  workedInitial,
} from "./fixtures/vectors.ts";
import {
  cashOut,
  firstMove,
  moves,
  otherFirstMove,
  playMoves,
  requestOf,
  secondMove,
} from "./fixtures/worked-round.ts";

describe("the chain (W-18)", () => {
  it("replays the worked round: sequence, previous, struct hash, digest", async () => {
    const session = await openTestSession();
    const round = openWorkedRound(session);
    expect(round.last()).toBe(workedInitial);
    const signed = [];
    for (const vector of moves) {
      expect(round.nextSequence()).toBe(vector.sequence);
      signed.push(round.sign(requestOf(vector)));
      expect(round.observe(snapshot("active", { step: vector.sequence }))).toBe(
        "applied",
      );
      expect(round.last()).toBe(vector.structHash);
    }
    expect(round.nextSequence()).toBe(cashOut.sequence);
    signed.push(round.sign(requestOf(cashOut)));
    expect(
      signed.map(action => ({
        sequence: action.message.sequence,
        previous: action.message.previous,
        structHash: action.structHash,
        digest: action.digest,
      })),
    ).toEqual(
      workedActions.map(vector => ({
        sequence: vector.sequence,
        previous: vector.previous,
        structHash: vector.structHash,
        digest: vector.digest,
      })),
    );
    expect(
      signed.map(action => recoverAddress(action.digest, action.signature)),
    ).toEqual(signed.map(() => session.address()));
  });

  it("starts at sequence 1 with previous = T_0", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    expect(action.message.sequence).toBe(1);
    expect(action.message.previous).toBe(workedInitial);
  });
});

describe("a signed action is recorded before it is sent (W-15, W-16)", () => {
  it("is the pending action as soon as sign returns", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    expect(round.pending()).toBe(action);
    expect(action.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(action.idempotencyKey.length).toBeLessThanOrEqual(128);
    expect(Object.isFrozen(action)).toBe(true);
  });

  it("returns the same bytes and idempotency key for a resend", async () => {
    const round = openWorkedRound(await openTestSession());
    const first = round.sign(firstMove);
    const again = round.sign(firstMove);
    expect(again).toBe(first);
    expect(again.signature).toBe(first.signature);
    expect(again.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("refuses another action while one is pending", async () => {
    const round = openWorkedRound(await openTestSession());
    const first = round.sign(firstMove);
    expect(shellCodeOf(() => round.sign(otherFirstMove))).toBe("equivocation");
    expect(
      shellCodeOf(() =>
        round.sign({ kind: "cash-out", action: "cash out", path: [] }),
      ),
    ).toBe("equivocation");
    expect(round.pending()).toBe(first);
  });

  it("draws a new idempotency key per intent", async () => {
    const round = openWorkedRound(await openTestSession());
    const first = round.sign(firstMove);
    round.observe(snapshot("active", { step: 1 }));
    const second = round.sign(secondMove);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("signs nothing when the idempotency key cannot be drawn", async () => {
    const round = openWorkedRound(
      await openTestSession({ randomUuid: () => "not-a-uuid" }),
    );
    expect(() => round.sign(firstMove)).toThrow(TypeError);
    expect(round.pending()).toBeUndefined();
  });
});

describe("T advances only on an applied Snapshot (W-18)", () => {
  it("keeps the action pending while the Snapshot does not show it", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    for (const shown of [
      snapshot("active", { step: 0 }),
      snapshot("resolving", { step: 0 }),
      snapshot("starting"),
    ]) {
      expect(round.observe(shown)).toBe("not-applied");
    }
    expect(round.pending()).toBe(action);
    expect(round.last()).toBe(workedInitial);
    expect(round.nextSequence()).toBe(1);
  });

  it("ignores another round's Snapshot and the idle one", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    expect(
      round.observe(snapshot("active", { roundId: OTHER_ROUND_ID, step: 1 })),
    ).toBe("other-round");
    expect(round.observe(snapshot("idle"))).toBe("other-round");
    expect(round.last()).toBe(workedInitial);
  });

  it("never counts a resolving Snapshot as the move applied", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    expect(round.observe(snapshot("resolving", { step: 1 }))).toBe(
      "not-applied",
    );
    expect(round.last()).toBe(workedInitial);
    expect(round.pending()).toBe(action);
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("applied");
    expect(round.last()).toBe(action.structHash);
    expect(round.pending()).toBeUndefined();
  });

  it("stops when the Snapshot shows an action it did not sign", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    expect(round.observe(snapshot("active", { step: 2 }))).toBe("out-of-sync");
    expect(round.phase()).toBe("out-of-sync");
    expect(round.last()).toBe(workedInitial);
    expect(shellCodeOf(() => round.sign(firstMove))).toBe("round-stopped");
  });

  it("stops when progress moves with nothing pending", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 1);
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("not-applied");
    expect(round.observe(snapshot("active", { step: 2 }))).toBe("out-of-sync");
  });

  it.each(["won", "lost", "canceled"] as const)(
    "closes the round on %s",
    async status => {
      const round = openWorkedRound(await openTestSession());
      round.sign(firstMove);
      expect(round.observe(snapshot(status))).toBe("closed");
      expect(round.phase()).toBe("closed");
      expect(shellCodeOf(() => round.sign(secondMove))).toBe("round-stopped");
      expect(round.observe(snapshot("active", { step: 1 }))).toBe("closed");
    },
  );

  it.each(["won", "lost"] as const)(
    "confirms the last move when a %s Snapshot shows it, then closes",
    async status => {
      const round = openWorkedRound(await openTestSession());
      playMoves(round, 1);
      const action = round.sign(secondMove);
      expect(round.observe(snapshot(status, { step: 2 }))).toBe("closed");
      expect(round.phase()).toBe("closed");
      expect(round.last()).toBe(action.structHash);
      expect(round.nextSequence()).toBe(3);
      expect(round.pending()).toBeUndefined();
    },
  );

  it.each([
    ["won", 1],
    ["canceled", 1],
    ["canceled", 0],
  ] as const)(
    "closes on %s at step %i without confirming the pending move",
    async (status, step) => {
      const round = openWorkedRound(await openTestSession());
      playMoves(round, 1);
      const before = round.last();
      const action = round.sign(secondMove);
      expect(round.observe(snapshot(status, { step }))).toBe("closed");
      expect(round.phase()).toBe("closed");
      expect(round.last()).toBe(before);
      expect(round.pending()).toBe(action);
    },
  );

  it("confirms the last move on canceled at its step too: only step decides", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 1);
    const action = round.sign(secondMove);
    expect(round.observe(snapshot("canceled", { step: 2 }))).toBe("closed");
    expect(round.last()).toBe(action.structHash);
    expect(round.pending()).toBeUndefined();
  });

  it("never confirms a pending cash-out, even at a terminal step equal to its sequence", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 2);
    const before = round.last();
    const action = round.sign(requestOf(cashOut));
    const { sequence } = action.message;
    expect(round.observe(snapshot("won", { step: sequence }))).toBe("closed");
    expect(round.last()).toBe(before);
    expect(round.nextSequence()).toBe(sequence);
    expect(round.pending()).toBe(action);
  });

  it("never confirms a pending cancel, even at a terminal step equal to its sequence", async () => {
    const round = openWorkedRound(await openTestSession());
    const cancel = round.signCancel();
    expect(round.observe(snapshot("canceled", { step: 1 }))).toBe("closed");
    expect(round.last()).toBe(workedInitial);
    expect(round.nextSequence()).toBe(1);
    expect(round.pending()).toBe(cancel);
  });

  it("never sees a cash-out applied while the round is open", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 3);
    const action = round.sign(requestOf(cashOut));
    expect(round.observe(snapshot("active", { step: 3 }))).toBe("not-applied");
    expect(round.pending()).toBe(action);
    expect(round.observe(snapshot("won"))).toBe("closed");
  });
});
