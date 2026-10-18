// Signing, recording, and sending a round's moves and cash-outs (W-16, W-19),
// and reading the round's Snapshot. An action is recorded with its exact body
// before it is sent; a lost response or a retryable problem is repeated by the
// transport with the same bytes and key, and `send` sends the recorded body
// again later. A 400 `INVALID_ARGUMENT` or a 409 `STALE_ACTION` holds the
// round's signing and reads the Snapshot, which decides (W-19).

import {
  type Authorization,
  cashOutRound,
  continueRound,
  getSnapshot,
  type Transport,
} from "@intraverse/se-client-play-client";
import type { TranscriptRequest } from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { ShellError } from "./errors.ts";
import type { PendingAction } from "./pending-action.ts";
import {
  asksResync,
  isCallError,
  isUnknownOutcome,
  type Route,
  type Sent,
  signedBody,
  snapshotOf,
} from "./round-request.ts";
import type { RoundSigner } from "./round-signer.ts";
import { encoderOf, type FlowTestHooks } from "./typed-data.ts";

export type DeliveryOptions = {
  readonly transport: Transport;
  /** The play token's `Authorization` value, read once per attempt. */
  readonly authorization: Authorization;
};

export type DeliveryHost = {
  readonly roundId: string;
  /** Reads a validated Snapshot of the round. */
  readonly observe: (snapshot: ValidSnapshot) => Promise<unknown>;
  readonly signer: () => RoundSigner | undefined;
};

export type RoundDelivery = {
  /** Whether a call that carries a signed action is in flight. */
  readonly busy: () => boolean;
  /** Runs `call` with `busy` set. */
  readonly whileBusy: (call: () => Promise<void>) => Promise<void>;
  /** The last failure of a call, for the error state (W-42). */
  readonly lastError: () => Error | undefined;
  readonly fail: (error: Error) => void;
  /** Every action signed for the round, in order. */
  readonly signed: () => readonly PendingAction[];
  /** The last action recorded, with its body. */
  readonly lastSent: () => Sent | undefined;
  /**
   * The move or cash-out whose last send had an unknown outcome (no response,
   * or a 503 not marked `retryable: false`, after the transport's own retries),
   * until a send of it is answered (W-16, W-42, W-43).
   */
  readonly lost: () => PendingAction | undefined;
  /** Whether `action` has had its one W-16 resend, by any path. */
  readonly resent: (action: PendingAction) => boolean;
  /**
   * W-16's one resend of a recorded move or cash-out: sends its recorded body
   * again (with `busy` set) and resolves `true`, or sends nothing and resolves
   * `false` when the action has had its resend already. Every resend, the
   * flow's own and the player actions' `resend`, goes through here, so an
   * action is sent at most twice.
   */
  readonly resendOnce: (sent: Sent) => Promise<boolean>;
  /** Records a signed action and its body before it is sent (W-16). */
  readonly record: (sent: Sent) => Sent;
  /** Encodes, signs, and records a move or a cash-out at the next sequence. */
  readonly sign: (signer: RoundSigner, request: TranscriptRequest) => Sent;
  /** Sends a recorded move or cash-out on its route and reads the answer. */
  readonly send: (sent: Sent) => Promise<void>;
  /** Reads the round's Snapshot (`getSnapshot`) and observes it. */
  readonly refresh: () => Promise<void>;
  /**
   * As `refresh`, keeping a call failure as `lastError` instead. Resolves with
   * the Snapshot this read validated, or `undefined` when the read failed.
   */
  readonly resync: () => Promise<ValidSnapshot | undefined>;
  /**
   * Reads and validates the Snapshot without observing it, keeping a call
   * failure as `lastError`: `undefined` when the read failed.
   */
  readonly fetch: () => Promise<ValidSnapshot | undefined>;
  /** Observes an answer's body, validated. */
  readonly observeBody: (body: unknown) => Promise<void>;
};

const routeOf = (action: PendingAction): Route =>
  action.kind === "cash-out" ? cashOutRound : continueRound;

/**
 * `hooks` is test-only (typed-data.ts): production passes none, and the typed
 * data is `signing`'s canonical encoding.
 */
export const createRoundDelivery = (
  options: DeliveryOptions,
  host: DeliveryHost,
  hooks: FlowTestHooks = {},
): RoundDelivery => {
  const { transport, authorization } = options;
  const encode = encoderOf(hooks);
  const signed: PendingAction[] = [];
  let lastSent: Sent | undefined;
  let lost: PendingAction | undefined;
  // The actions that had their one resend (W-16): never a third send.
  const resentActions = new WeakSet<PendingAction>();
  let lastError: Error | undefined;
  let busy = false;

  const fail = (error: Error): void => {
    lastError = error;
  };

  const record = (sent: Sent): Sent => {
    signed.push(sent.action);
    lastSent = sent;
    return sent;
  };

  const observeBody = async (body: unknown): Promise<void> => {
    await host.observe(snapshotOf(body));
  };

  const refresh = async (): Promise<void> => {
    const result = await getSnapshot(transport, { authorization });
    await observeBody(result.body);
  };

  const fetch = async (): Promise<ValidSnapshot | undefined> => {
    try {
      const result = await getSnapshot(transport, { authorization });
      return snapshotOf(result.body);
    } catch (error) {
      // A later read decides (W-19, W-43).
      if (!isCallError(error)) throw error;
      fail(error);
      return undefined;
    }
  };

  const resync = async (): Promise<ValidSnapshot | undefined> => {
    try {
      const result = await getSnapshot(transport, { authorization });
      const snapshot = snapshotOf(result.body);
      await host.observe(snapshot);
      return snapshot;
    } catch (error) {
      // The round stays held: a later read decides (W-19, W-43).
      if (!isCallError(error)) throw error;
      fail(error);
      return undefined;
    }
  };

  const sign = (signer: RoundSigner, request: TranscriptRequest): Sent =>
    record(
      signedBody(
        encode,
        host.roundId,
        request.kind,
        {
          action: request.action,
          path: request.path,
          sequence: signer.nextSequence(),
          round: signer.round,
          previous: signer.last(),
        },
        () => signer.sign(request),
        () => {
          // The bytes would not carry what was signed: the round signs and
          // resends nothing more, and the error state shows (W-42).
          signer.fail();
          fail(new ShellError("invalid-input"));
        },
      ),
    );

  const send = async (sent: Sent): Promise<void> => {
    try {
      const result = await routeOf(sent.action)(transport, sent.body, {
        authorization,
      });
      if (lost === sent.action) lost = undefined;
      await observeBody(result.body);
    } catch (error) {
      if (!isCallError(error)) throw error;
      fail(error);
      lost = isUnknownOutcome(error) ? sent.action : undefined;
      if (asksResync(error)) {
        host.signer()?.stale();
        await resync();
      }
      // Otherwise the outcome is unknown or the action was refused for another
      // reason: it stays pending, and a resend or a Snapshot read decides.
    }
  };

  const whileBusy = async (call: () => Promise<void>): Promise<void> => {
    busy = true;
    try {
      await call();
    } finally {
      busy = false;
    }
  };

  const resendOnce = async (sent: Sent): Promise<boolean> => {
    if (resentActions.has(sent.action)) return false;
    resentActions.add(sent.action);
    await whileBusy(() => send(sent));
    return true;
  };

  return Object.freeze({
    busy: (): boolean => busy,
    whileBusy,
    lastError: (): Error | undefined => lastError,
    fail,
    signed: (): readonly PendingAction[] => Object.freeze([...signed]),
    lastSent: (): Sent | undefined => lastSent,
    lost: (): PendingAction | undefined => lost,
    resent: (action: PendingAction): boolean => resentActions.has(action),
    resendOnce,
    record,
    sign,
    send,
    refresh,
    resync,
    fetch,
    observeBody,
  });
};
