// The bounded loop of the preview specs (RFC-002): it stops at the first target
// and fails at 40, with an injected outcome source and no browser.

import { expect, test } from "../harness/worker-browser.ts";
import {
  MAX_ROUNDS,
  OutcomeNotSeenError,
  playUntil,
  type RoundOutcome,
} from "../preview-support/round-loop.ts";

/** An outcome source that plays `outcomes` in order, then `rest` forever. */
const source = (outcomes: readonly RoundOutcome[], rest: RoundOutcome) => {
  const calls: number[] = [];
  return {
    calls,
    play: (round: number): Promise<RoundOutcome> => {
      calls.push(round);
      return Promise.resolve(outcomes[round - 1] ?? rest);
    },
  };
};

/** The third round is the win. */
const third = (round: number): RoundOutcome => (round === 3 ? "won" : "lost");

test.describe("the round loop", () => {
  test("stops at the first target", async () => {
    const outcomes = source(["lost", "lost", "won", "won"], "lost");
    expect(await playUntil("won", outcomes.play)).toEqual({ rounds: 3 });
    expect(outcomes.calls).toEqual([1, 2, 3]);
  });

  test("stops at the first round when it is the target", async () => {
    const outcomes = source(["lost"], "won");
    expect(await playUntil("lost", outcomes.play)).toEqual({ rounds: 1 });
    expect(outcomes.calls).toEqual([1]);
  });

  test("sees the target on the last round it may play", async () => {
    const outcomes = source(
      Array.from({ length: 39 }, () => "lost"),
      "won",
    );
    expect(await playUntil("won", outcomes.play)).toEqual({
      rounds: MAX_ROUNDS,
    });
  });

  test("fails after 40 rounds without the target", async () => {
    const outcomes = source([], "lost");
    const failure = await playUntil("won", outcomes.play).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(OutcomeNotSeenError);
    expect(failure).toMatchObject({ target: "won", rounds: 40 });
    expect(outcomes.calls).toHaveLength(40);
    expect(MAX_ROUNDS).toBe(40);
  });

  test("plays rounds one after another", async () => {
    let inFlight = 0;
    let overlapped = false;
    await playUntil("won", async round => {
      inFlight += 1;
      overlapped ||= inFlight > 1;
      await Promise.resolve();
      inFlight -= 1;
      return third(round);
    });
    expect(overlapped).toBe(false);
  });

  test("passes an error of a round on", async () => {
    await expect(
      playUntil("won", () => Promise.reject(new Error("the stack failed"))),
    ).rejects.toThrow("the stack failed");
  });
});
