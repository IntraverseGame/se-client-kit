// T-4b, T-8 (W-20, W-25, W-26): the `PlayerCancel` the shell signs through
// the round flow, on the vendored Coin Flip round with `T_0` settled and only
// the tip check failed, is the independent signer's `signed-action/` vector:
// the same message, struct hash, digest, and typedData, and a signature that
// recovers to the session's own key. (The exact signature bytes with the
// vector's test key are `signing`'s replay of the same vector.)

import { recoverAddress } from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { coinFlip } from "./fixtures/coin-flip.ts";
import { ok } from "./fixtures/fake-play.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { vendoredRound } from "./fixtures/round-auth.ts";
import { nth } from "./fixtures/round-flow.ts";
import { coinflipCancelVector } from "./fixtures/signed-action.ts";

type Body = Readonly<Record<string, unknown>>;

describe("the required Coin Flip cancel (signed-action/coinflip-cancel)", () => {
  it("is signed as the independent signer's vector", async () => {
    const vector = coinflipCancelVector();
    const { flow, play, session } = await coinFlip(TIP_FAILED);
    play.answer("cancelRound", ok(vendoredRound()));
    await flow.observe(vendoredRound());
    const cancel = nth(flow.evidence().signed, 0);
    expect(cancel.kind).toBe("cancel");
    expect(cancel.message).toEqual({
      action: "cancel",
      path: [],
      sequence: 1,
      round: vector.round,
      previous: vector.previous,
    });
    expect(cancel.structHash).toBe(vector.structHash);
    expect(cancel.digest).toBe(vector.digest);
    expect(recoverAddress(cancel.digest, cancel.signature)).toBe(
      session.address(),
    );
    const body = play.sent("cancelRound")[0]?.body as Body;
    expect(body["typedData"]).toBe(vector.typedDataBase64);
    expect(body["signature"]).toBe(cancel.signature);
  });
});
