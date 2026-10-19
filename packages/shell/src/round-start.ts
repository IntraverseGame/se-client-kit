// Starting a round (W-22): the Play API's `start` verb with a fresh
// idempotency key, the bet as an `AmountRequest`, and the action key's
// address. There is no signed start: nothing is signed here, and the round's
// `CreateRoundAuth` then commits to that address (W-26, check 3). A start whose
// round may exist although its answer was lost is sent once more with the same
// key and body (`startMayBeStored`), which the Play API document answers with
// the stored round.

import {
  newIntent,
  type PlayResult,
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
import { roundSnapshotOf, startMayBeStored } from "./round-request.ts";
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
 * `snapshot-rejected`. A start whose round may exist (`startMayBeStored`: no
 * response, a 503 `UNAVAILABLE` or a bare 503, a 500 `INTERNAL`) is sent once
 * more, right away, with the same `idempotencyKey` and body (W-22, W-36), once
 * the lock is checked again: a page that lost it, or a session that ended,
 * sends nothing more (`lock-not-held`, `session-ended`). The resend's answer is
 * read as a first answer would be, and its failure is thrown; the shell never
 * sends the start a third time, the transport's own repeats aside. `hooks` is
 * test-only (typed-data.ts): production passes none.
 */
export const startRoundFlow = async (
  options: StartRoundFlowOptions,
  hooks: FlowTestHooks = {},
): Promise<RoundFlow> => {
  const bet = validateAmountRequest(options.bet);
  if (!bet.ok) throw new ShellError("invalid-input");
  const actionKey = options.session.address();
  const { idempotencyKey } = newIntent(options.randomUuid);
  const body = { idempotencyKey, bet: bet.value, actionKey };
  const send = (): Promise<PlayResult<unknown>> =>
    startRound(options.transport, body, {
      authorization: options.authorization,
    });
  // One resend only, of the same intent (the transport's own repeats aside):
  // its failure is thrown, and the session reads it as it reads a first failure
  // (`ROUND_ACTIVE` included). The lock is checked again first, as before the
  // first send: `address` throws `lock-not-held` once the page lost it, and
  // `session-ended` once the session ended.
  const result = await send().catch((error: unknown) => {
    if (!startMayBeStored(error)) throw error;
    options.session.address();
    return send();
  });
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
