// T-4b and T-17's unit-level half (W-14, W-22, W-26): the start sends the
// action key and the bet and signs nothing; of two tabs of one session, only
// the one with the signer lock starts or signs, and no sequence is signed
// twice.

import { describe, expect, it } from "vitest";

import { createFakeLockManager, flush } from "./fixtures/fake-locks.ts";
import { ok } from "./fixtures/fake-play.ts";
import { TIP_PASSED } from "./fixtures/flow-stand-ins.ts";
import {
  ACCEPTED,
  bodyOf,
  type FlowSetup,
  NOT_ACTIVE,
  setUpFlow,
  started,
  startFlow,
  THREE_STEPS,
} from "./fixtures/round-flow.ts";
import {
  openTestSession,
  SESSION_ID,
  shellCodeOf,
} from "./fixtures/session.ts";
import { ROUND_ID } from "./fixtures/vectors.ts";
import { createRoundFlow, type RoundFlow } from "./round-flow.ts";
import { startRoundFlow } from "./round-start.ts";

/** The set-up round as another tab of the session holds it, without a start. */
const flowWithout = (
  setup: FlowSetup,
  session: FlowSetup["session"],
): RoundFlow =>
  createRoundFlow(
    { ...setup.options, session },
    {
      roundId: ROUND_ID,
      request: { actionKey: setup.actionKey, bet: setup.options.bet },
    },
    setup.issued.snapshot,
    setup.hooks,
  );

describe("start (W-22, W-26)", () => {
  it("sends the action key and the bet, signs nothing, and opens the round with the settled T_0", async () => {
    const { setup, flow } = await started();
    const [start] = setup.play.sent("startRound");
    expect(bodyOf(start)).toEqual({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      bet: { value: "100", unit: "EUR" },
      actionKey: setup.session.address(),
    });
    expect(start?.retry).toBe("idempotent");
    expect(flow.verdict()).toEqual({
      state: "ready",
      initial: setup.issued.initial,
    });
    expect(flow.phase()).toBe("open");
    expect(flow.evidence().signed).toEqual([]);
    expect(setup.encoder.calls()).toEqual([]);
    expect(flow.evidence().tip).toBe(TIP_PASSED.record);
  });

  it("refuses a bet that is not an AmountRequest, before anything is sent", async () => {
    const setup = await setUpFlow();
    setup.play.answer("startRound", ok(setup.issued.snapshot));
    await expect(
      startFlow({
        ...setup,
        options: { ...setup.options, bet: { value: "1.5", unit: "EUR" } },
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });
    expect(setup.play.all()).toEqual([]);
  });

  it("rejects a start answer that is not a valid Snapshot of a round", async () => {
    const setup = await setUpFlow();
    setup.play.answer("startRound", ok({ status: "active" }));
    await expect(startRoundFlow(setup.options)).rejects.toMatchObject({
      code: "snapshot-rejected",
    });
  });
});

describe("two tabs of one session (W-14)", () => {
  it("the tab without the lock cannot start a round, and sends nothing", async () => {
    const locks = createFakeLockManager();
    const setup = await setUpFlow({ session: { locks } });
    const second = await openTestSession({ locks });
    expect(second.state()).toBe("held-elsewhere");
    await expect(
      startFlow({ ...setup, options: { ...setup.options, session: second } }),
    ).rejects.toMatchObject({ code: "lock-not-held" });
    expect(setup.play.all()).toEqual([]);
  });

  it("never signs twice at one sequence, the lock lost included", async () => {
    const locks = createFakeLockManager();
    const { setup, flow } = await started({
      steps: THREE_STEPS,
      session: { locks },
    });
    const second = await openTestSession({ locks });
    const other = flowWithout(setup, second);
    await other.observe(setup.at(0));
    expect(other.phase()).toBe("unopened");
    expect(await other.pick({ step: 0, option: 2 })).toEqual(NOT_ACTIVE);

    setup.play.answer("continueRound", ok(setup.at(1)));
    expect(await flow.pick({ step: 0, option: 1 })).toEqual(ACCEPTED);
    locks.steal(`se:signer:${SESSION_ID}`);
    await flush();
    expect(await flow.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(await other.pick({ step: 1, option: 1 })).toEqual(NOT_ACTIVE);
    expect(shellCodeOf(() => second.address())).toBe("lock-not-held");
    const sequences = [
      ...flow.evidence().signed,
      ...other.evidence().signed,
    ].map(action => action.message.sequence);
    expect(sequences).toEqual([1]);
  });
});
