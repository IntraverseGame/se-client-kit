// Starting a round (W-22): the Play API's `start` verb with a fresh
// idempotency key, the bet as an `AmountRequest`, and the action key's
// address. There is no signed start: nothing is signed here, and a config
// round's `CreateRoundAuth` then commits to that address (W-26, check 3). A
// book round (`playback`, W-51) starts the same way and is then only read: the
// session holds it as a book round (book-round.ts), which signs nothing. A start whose
// round may exist although its answer was lost is sent once more with the same
// key and body (`startMayBeStored`): the Play API document says that after a
// lost response, `UNAVAILABLE`, or `INTERNAL` the round may already have been
// started, and the same key and body answer it.

import {
  newIntent,
  type PlayResult,
  type RandomUuid,
  startRound,
} from "@intraverse/se-client-play-client";
import { validateAmountRequest } from "@intraverse/se-client-snapshot";

import { createBookRound } from "./book-round.ts";
import type { StartRequest } from "./create-round-auth.ts";
import { ShellError } from "./errors.ts";
import {
  createRoundFlow,
  type RoundFlow,
  type RoundFlowOptions,
} from "./round-flow.ts";
import {
  type RoundSnapshot,
  roundSnapshotOf,
  startMayBeStored,
} from "./round-request.ts";
import type { SessionRound } from "./session-round.ts";
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

/** A start that was answered: the round's first Snapshot and what was sent. */
type Started = {
  readonly snapshot: RoundSnapshot;
  readonly request: StartRequest;
  readonly idempotencyKey: string;
};

/**
 * Sends `start` (and its one resend, below) and validates the answer, which
 * must be a Snapshot of a round.
 */
const sendStart = async (options: StartRoundFlowOptions): Promise<Started> => {
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
  return {
    snapshot: roundSnapshotOf(result.body),
    request: {
      actionKey,
      bet: { value: bet.value.value, unit: bet.value.unit },
    },
    idempotencyKey,
  };
};

/**
 * Sends `start`, validates the answer, and returns the round's flow once it has
 * read that first Snapshot. A bet that is not an `AmountRequest` is
 * `invalid-input`, and a page without the signer lock `lock-not-held`, before
 * anything is sent; an answer that is not a valid Snapshot of a round is
 * `snapshot-rejected`. A start whose round may exist (`startMayBeStored`: no
 * response, a 503 `UNAVAILABLE` or a bare 503, a 500 `INTERNAL`) is sent once
 * more, right away, with the same `idempotencyKey` and body, which the Play API
 * document says answer a round already started (W-22, W-36), once the lock is
 * checked again: a page that lost it, or a session that ended, sends nothing
 * more (`lock-not-held`, `session-ended`). The resend's answer is read as a
 * first answer would be, and its failure is thrown; the shell never sends the
 * start a third time, the transport's own repeats aside. `hooks` is test-only
 * (typed-data.ts): production passes none.
 */
export const startRoundFlow = async (
  options: StartRoundFlowOptions,
  hooks: FlowTestHooks = {},
): Promise<RoundFlow> => {
  const { snapshot, request } = await sendStart(options);
  const flow = createRoundFlow(
    options,
    { roundId: snapshot.roundId, request },
    snapshot,
    hooks,
  );
  options.onFlow?.(flow);
  await flow.observe(snapshot);
  return flow;
};

export type StartSessionRoundOptions = Omit<StartRoundFlowOptions, "onFlow"> & {
  /** As `StartRoundFlowOptions.onFlow`, with the round the session holds. */
  readonly onFlow?: (round: SessionRound) => void;
};

/**
 * The session's start (W-22, W-51): as `startRoundFlow`, but the round's first
 * Snapshot decides what the session holds. One the session's W-53 guard
 * (`admit`) refuses is not read in: nothing is held and `undefined` is returned
 * (a changed session). A `playback` Snapshot is a book round, which signs
 * nothing and is only read (book-round.ts); any other is a config round's flow.
 * `hooks` is test-only (typed-data.ts).
 */
export const startSessionRound = async (
  options: StartSessionRoundOptions,
  hooks: FlowTestHooks = {},
): Promise<SessionRound | undefined> => {
  const { onFlow, ...flowOptions } = options;
  const { snapshot, request, idempotencyKey } = await sendStart(flowOptions);
  if (options.admit?.(snapshot) === false) return undefined;
  if (snapshot.presentation === "playback") {
    const round = createBookRound(
      { roundId: snapshot.roundId, request: { ...request, idempotencyKey } },
      snapshot,
      options.admit === undefined ? {} : { admit: options.admit },
    );
    onFlow?.(round);
    await round.observe(snapshot);
    return round;
  }
  const flow = createRoundFlow(
    flowOptions,
    { roundId: snapshot.roundId, request },
    snapshot,
    hooks,
  );
  onFlow?.(flow);
  await flow.observe(snapshot);
  return flow;
};
