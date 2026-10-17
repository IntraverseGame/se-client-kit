// W-15, W-16, W-17: an injected function (the idempotency key source) that
// calls back into the round's state while it signs is refused, so one sequence
// never gets two actions and a pending action keeps one idempotency key.

import { describe, expect, it } from "vitest";

import { seededUuids } from "./fixtures/seeded.ts";
import {
  openTestSession,
  openWorkedRound,
  shellCodeOf,
} from "./fixtures/session.ts";
import { firstMove, otherFirstMove } from "./fixtures/worked-round.ts";
import type { PendingAction } from "./pending-action.ts";
import type { RoundSigner } from "./round-signer.ts";

type Reentry = {
  /** The round, set once it is open. */
  round: RoundSigner | undefined;
  /** What the nested call did: a `ShellError` code, or "signed". */
  readonly nested: string[];
};

const reenter = (
  state: Reentry,
  call: (round: RoundSigner) => unknown,
): void => {
  const { round } = state;
  if (round === undefined) return;
  state.nested.push(shellCodeOf(() => call(round)) ?? "signed");
};

/** A UUID source that calls `call` on the round the first time it is used. */
const reenteringUuids = (
  state: Reentry,
  call: (round: RoundSigner) => unknown,
): (() => string) => {
  const uuids = seededUuids(5);
  let first = true;
  return (): string => {
    if (first) {
      first = false;
      reenter(state, call);
    }
    return uuids();
  };
};

const atSequenceOne = (
  actions: readonly (PendingAction | undefined)[],
): number =>
  new Set(
    actions
      .filter(action => action?.message.sequence === 1)
      .map(action => action?.signature),
  ).size;

describe("a call back into the round while it signs", () => {
  it("from the idempotency key source during sign is refused", async () => {
    const state: Reentry = { round: undefined, nested: [] };
    const session = await openTestSession({
      randomUuid: reenteringUuids(state, round => round.sign(otherFirstMove)),
    });
    state.round = openWorkedRound(session);
    const action = state.round.sign(firstMove);
    expect(state.nested).toEqual(["equivocation"]);
    expect(state.round.pending()).toBe(action);
    expect(state.round.sign(firstMove).idempotencyKey).toBe(
      action.idempotencyKey,
    );
    expect(atSequenceOne([action, state.round.pending()])).toBe(1);
  });

  it("from the idempotency key source asking the same move is refused", async () => {
    const state: Reentry = { round: undefined, nested: [] };
    const session = await openTestSession({
      randomUuid: reenteringUuids(state, round => round.sign(firstMove)),
    });
    state.round = openWorkedRound(session);
    const action = state.round.sign(firstMove);
    expect(state.nested).toEqual(["equivocation"]);
    expect(state.round.sign(firstMove)).toBe(action);
  });

  it("from the idempotency key source during sign, asking a cancel, is refused", async () => {
    const state: Reentry = { round: undefined, nested: [] };
    const session = await openTestSession({
      randomUuid: reenteringUuids(state, round => round.signCancel()),
    });
    state.round = openWorkedRound(session);
    const action = state.round.sign(firstMove);
    expect(state.nested).toEqual(["equivocation"]);
    expect(state.round.pending()).toBe(action);
    expect(shellCodeOf(() => state.round?.signCancel())).toBe("equivocation");
  });

  it("from the idempotency key source during signCancel is refused", async () => {
    const state: Reentry = { round: undefined, nested: [] };
    const session = await openTestSession({
      randomUuid: reenteringUuids(state, round => round.sign(firstMove)),
    });
    state.round = openWorkedRound(session);
    const cancel = state.round.signCancel();
    expect(state.nested).toEqual(["equivocation"]);
    expect(state.round.pending()).toBe(cancel);
    expect(state.round.signCancel()).toBe(cancel);
    expect(state.round.signCancel().idempotencyKey).toBe(cancel.idempotencyKey);
    expect(shellCodeOf(() => state.round?.sign(firstMove))).toBe(
      "equivocation",
    );
    expect(atSequenceOne([cancel, state.round.pending()])).toBe(1);
  });

  it("is allowed again once the outer call returned", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    expect(round.sign(firstMove).message.sequence).toBe(1);
  });
});
