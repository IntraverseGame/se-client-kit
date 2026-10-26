// The bounded loop of the preview specs (RFC-002): play rounds until the target
// outcome is seen, at most 40. The bound is a test-design choice asked for by
// the backend, not a probability argument: a run that does not see the outcome
// fails, which is the intended signal. The loop plays the default bet the
// Wrapper offers and never chooses an amount. The outcome source is injected, so
// the logic is tested without a browser.

/** The most rounds a loop plays. */
export const MAX_ROUNDS = 40;

export type RoundOutcome = "lost" | "won";

export class OutcomeNotSeenError extends Error {
  readonly target: RoundOutcome;
  readonly rounds: number;

  constructor(target: RoundOutcome, rounds: number) {
    super(`no ${target} round in ${String(rounds)} rounds`);
    this.name = "OutcomeNotSeenError";
    this.target = target;
    this.rounds = rounds;
  }
}

export type LoopResult = {
  /** The rounds played, the last one being the target. */
  readonly rounds: number;
};

/**
 * Plays rounds with `playRound` (its argument is the round's number from 1; it
 * returns the round's outcome) until one is `target`. Throws an
 * `OutcomeNotSeenError` after `maxRounds` without it.
 */
export const playUntil = async (
  target: RoundOutcome,
  playRound: (round: number) => Promise<RoundOutcome>,
  maxRounds: number = MAX_ROUNDS,
): Promise<LoopResult> => {
  for (let round = 1; round <= maxRounds; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a round starts after the last one settles
    if ((await playRound(round)) === target) return { rounds: round };
  }
  throw new OutcomeNotSeenError(target, maxRounds);
};
