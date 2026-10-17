// T-4b (W-14, W-25): the required cancel that cannot be signed, because the
// signer lock was lost (`lock-not-held`), is `unavailable`: nothing is
// recorded or sent, and it is not tried again.

import { describe, expect, it } from "vitest";

import type { SettledInitial } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import { TIP_FAILED } from "./fixtures/flow-stand-ins.ts";
import { setUpFlow } from "./fixtures/round-flow.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundCancel } from "./round-cancel.ts";
import { createRoundDelivery } from "./round-delivery.ts";
import { createRoundTracking } from "./round-tracking.ts";

/** The settled `T_0` of a failed verdict, or a thrown error. */
const initialOf = (
  verdict: Awaited<
    ReturnType<ReturnType<typeof createRoundTracking>["observe"]>
  >,
): SettledInitial => {
  if (verdict.state !== "failed" || verdict.initial === undefined) {
    throw new TypeError("fixture: no settled T_0");
  }
  return verdict.initial;
};

describe("the required cancel without the signer lock (W-14, W-25)", () => {
  it("is unavailable when signing it throws lock-not-held, and nothing is sent", async () => {
    const setup = await setUpFlow({ tip: TIP_FAILED });
    const tracking = createRoundTracking(
      setup.options,
      {
        roundId: ROUND_ID,
        request: { actionKey: setup.actionKey, bet: setup.options.bet },
      },
      setup.issued.snapshot,
    );
    const verdict = await tracking.observe(setup.at(0));
    const signer = tracking.signer();
    expect(verdict).toMatchObject({ state: "failed", cancel: true });
    expect(signer).toBeDefined();
    const initial = initialOf(verdict);
    const delivery = createRoundDelivery(setup.options, {
      roundId: ROUND_ID,
      observe: tracking.observe,
      signer: tracking.signer,
    });
    const cancel = createRoundCancel(
      setup.options,
      { roundId: ROUND_ID, reissued: () => false, intoRound: tracking.observe },
      delivery,
    );
    const lockLost = {
      ...(signer as NonNullable<typeof signer>),
      signCancel: (): never => {
        throw new ShellError("lock-not-held");
      },
    };
    await cancel.run(lockLost, initial);
    expect(cancel.state()).toBe("unavailable");
    expect(setup.play.sent("cancelRound")).toEqual([]);
    expect(delivery.signed()).toEqual([]);
    await cancel.run(lockLost, initial);
    expect(cancel.state()).toBe("unavailable");
  });
});
