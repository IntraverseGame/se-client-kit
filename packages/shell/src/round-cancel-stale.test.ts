// T-4 (W-17, W-19, W-25): the cancel against the first move, and
// `STALE_ACTION`.

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import {
  openTestSession,
  openWorkedRound,
  shellCodeOf,
  testCancelHash,
} from "./fixtures/session.ts";
import { OTHER_ROUND_ID, snapshot, workedInitial } from "./fixtures/vectors.ts";
import { firstMove, playMoves, secondMove } from "./fixtures/worked-round.ts";

describe("cancel against the first move (W-17, W-25)", () => {
  it("signs PlayerCancel at sequence 1 with previous = T_0 and an empty path", async () => {
    const session = await openTestSession();
    const round = openWorkedRound(session);
    const cancel = round.signCancel();
    expect(cancel.kind).toBe("cancel");
    expect(cancel.message).toEqual({
      action: "cancel",
      path: [],
      sequence: 1,
      round: round.round,
      previous: workedInitial,
    });
    expect(cancel.structHash).toBe(testCancelHash(cancel.message));
    expect(recoverAddress(cancel.digest, cancel.signature)).toBe(
      session.address(),
    );
    expect(round.signCancel()).toBe(cancel);
  });

  it("refuses the first move after a cancel", async () => {
    const round = openWorkedRound(await openTestSession());
    const cancel = round.signCancel();
    expect(shellCodeOf(() => round.sign(firstMove))).toBe("equivocation");
    expect(round.pending()).toBe(cancel);
  });

  it("refuses a cancel after the first move, pending or applied", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    expect(shellCodeOf(() => round.signCancel())).toBe("equivocation");
    round.observe(snapshot("active", { step: 1 }));
    expect(shellCodeOf(() => round.signCancel())).toBe("equivocation");
  });

  it("refuses a cancel without a cancel encoding (provisional)", async () => {
    const round = openWorkedRound(
      await openTestSession({ withoutCancel: true }),
    );
    expect(shellCodeOf(() => round.signCancel())).toBe("cancel-unavailable");
    expect(round.pending()).toBeUndefined();
    expect(round.sign(firstMove).message.sequence).toBe(1);
  });

  it("refuses a cancel encoding that is not a 32-byte hash", async () => {
    const round = openWorkedRound(
      await openTestSession({ hashCancel: () => "0x12" }),
    );
    expect(shellCodeOf(() => round.signCancel())).toBe("invalid-input");
    expect(round.pending()).toBeUndefined();
  });

  it("closes the round on the canceled Snapshot", async () => {
    const round = openWorkedRound(await openTestSession());
    round.signCancel();
    expect(round.observe(snapshot("active", { step: 0 }))).toBe("not-applied");
    expect(round.observe(snapshot("canceled"))).toBe("closed");
  });
});

describe("STALE_ACTION (W-19)", () => {
  it("stops signing, the resend included", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.stale();
    expect(round.phase()).toBe("stale");
    expect(shellCodeOf(() => round.sign(firstMove))).toBe("round-stopped");
    expect(shellCodeOf(() => round.signCancel())).toBe("round-stopped");
  });

  it("adopts the outcome when the Snapshot shows its action applied, and still signs nothing", async () => {
    const round = openWorkedRound(await openTestSession());
    const action = round.sign(firstMove);
    round.stale();
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("applied");
    expect(round.phase()).toBe("adopted");
    expect(round.last()).toBe(action.structHash);
    expect(round.pending()).toBeUndefined();
    expect(shellCodeOf(() => round.sign(secondMove))).toBe("round-stopped");
    expect(shellCodeOf(() => round.signCancel())).toBe("round-stopped");
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("not-applied");
    expect(round.phase()).toBe("adopted");
    expect(round.observe(snapshot("won"))).toBe("closed");
  });

  it("is out of sync when the Snapshot does not show it", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.stale();
    expect(round.observe(snapshot("active", { step: 0 }))).toBe("out-of-sync");
    expect(round.phase()).toBe("out-of-sync");
    expect(round.last()).toBe(workedInitial);
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("out-of-sync");
  });

  it("waits for this round's Snapshot", async () => {
    const round = openWorkedRound(await openTestSession());
    round.sign(firstMove);
    round.stale();
    expect(
      round.observe(snapshot("active", { roundId: OTHER_ROUND_ID, step: 0 })),
    ).toBe("other-round");
    expect(round.phase()).toBe("stale");
  });

  it("is out of sync with nothing pending", async () => {
    const round = openWorkedRound(await openTestSession());
    playMoves(round, 1);
    round.stale();
    expect(round.observe(snapshot("active", { step: 1 }))).toBe("out-of-sync");
  });
});
