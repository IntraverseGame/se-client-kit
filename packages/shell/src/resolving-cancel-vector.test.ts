// T-4b (W-25), on the Snapshot contract `se.snapshot/1` as vendored from the
// backend's b27afc5: the golden `valid/coinflip-resolving-cancel` (the Coin
// Flip round with the player's cancel submitted and not yet answered) is not
// final. As the answer to the shell's own cancel it is not read into the round,
// and the cancel settles from the reads that follow.

import { describe, expect, it } from "vitest";

import { coinFlip } from "./fixtures/coin-flip.ts";
import { ok } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { vendoredRound } from "./fixtures/round-auth.ts";
import { snapshot, validated, vectorInput } from "./fixtures/vectors.ts";

const RESOLVING_CANCEL = "coinflip-resolving-cancel";

describe("the vendored resolving-cancel Snapshot (W-25)", () => {
  it("is a valid resolving Snapshot of the Coin Flip round", () => {
    const resolving = validated(vectorInput("valid", RESOLVING_CANCEL));
    expect(resolving.status).toBe("resolving");
    expect(resolving.roundId).toBe(vendoredRound().roundId);
  });

  it("as the cancel's answer, puts the cancel in settling without reading it in", async () => {
    const { flow, play } = await coinFlip(TIP_FAILED);
    const resolving = validated(vectorInput("valid", RESOLVING_CANCEL));
    play.answer("cancelRound", ok(resolving));
    play.answer("getSnapshot", ok(resolving));
    await flow.observe(vendoredRound());
    expect(flow.cancel()).toBe("settling");
    expect(play.sent("getSnapshot")).toHaveLength(1);
    // The read showed it again: still settling; an `idle` read ends it.
    play.answer("getSnapshot", ok(snapshot("idle")));
    await flow.refresh();
    expect(flow.cancel()).toBe("ended");
  });
});
