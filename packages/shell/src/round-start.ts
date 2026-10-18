// Starting a round (W-22): the Play API's `start` verb with a fresh
// idempotency key, the bet as an `AmountRequest`, and the action key's
// address. There is no signed start: nothing is signed here, and the round's
// `CreateRoundAuth` then commits to that address (W-26, check 3).

import {
  newIntent,
  type RandomUuid,
  startRound,
} from "@intraverse/se-client-play-client";
import { validateAmountRequest } from "@intraverse/se-client-snapshot";

import { ShellError } from "./errors.ts";
import {
  createRoundFlow,
  type RoundFlow,
  type RoundFlowOptions,
} from "./round-flow.ts";
import { roundSnapshotOf } from "./round-request.ts";
import type { FlowTestHooks } from "./typed-data.ts";

/** The bet of a `start`, copied from the Snapshot's own `Amount` fields. */
export type Bet = {
  readonly value: string;
  readonly unit: string;
  readonly decimals?: number;
};

export type StartRoundFlowOptions = RoundFlowOptions & {
  /** `crypto.randomUUID`: the start's idempotency key (W-22, W-36). */
  readonly randomUuid: RandomUuid;
  readonly bet: Bet;
  /**
   * Called with the round's flow once it exists, before its first Snapshot is
   * read: a cancel that Snapshot requires is signed and sent before this
   * function resolves, so the session holds the round from here (W-25).
   */
  readonly onFlow?: (flow: RoundFlow) => void;
};

/**
 * Sends `start`, validates the answer, and returns the round's flow once it has
 * read that first Snapshot. A bet that is not an `AmountRequest` is
 * `invalid-input`, and a page without the signer lock `lock-not-held`, before
 * anything is sent; an answer that is not a valid Snapshot of a round is
 * `snapshot-rejected`. `hooks` is test-only (typed-data.ts): production passes
 * none.
 */
export const startRoundFlow = async (
  options: StartRoundFlowOptions,
  hooks: FlowTestHooks = {},
): Promise<RoundFlow> => {
  const bet = validateAmountRequest(options.bet);
  if (!bet.ok) throw new ShellError("invalid-input");
  const actionKey = options.session.address();
  const { idempotencyKey } = newIntent(options.randomUuid);
  const result = await startRound(
    options.transport,
    { idempotencyKey, bet: bet.value, actionKey },
    { authorization: options.authorization },
  );
  const snapshot = roundSnapshotOf(result.body);
  const flow = createRoundFlow(
    options,
    {
      roundId: snapshot.roundId,
      request: {
        actionKey,
        bet: { value: bet.value.value, unit: bet.value.unit },
      },
    },
    snapshot,
    hooks,
  );
  options.onFlow?.(flow);
  await flow.observe(snapshot);
  return flow;
};
