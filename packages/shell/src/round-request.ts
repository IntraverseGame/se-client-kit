// What the round flow sends and how it reads the answer: the body of a signed
// action (W-16), the Snapshot it answers (validated, W-28), and which failures
// are the Play API's (handled) rather than the shell's (thrown).

import {
  type Authorization,
  NetworkError,
  type PlayResult,
  ProblemError,
  ProtocolError,
  type RoundActionRequest,
  type Transport,
} from "@intraverse/se-client-play-client";
import type { PlayerMessage } from "@intraverse/se-client-signing";
import {
  type ValidSnapshot,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";

import { ShellError } from "./errors.ts";
import type { PendingAction } from "./pending-action.ts";
import { type TypedDataEncoder, typedDataOf } from "./typed-data.ts";

/** A signed action and the exact body that carries it, resent as is (W-16). */
export type Sent = {
  readonly action: PendingAction;
  readonly body: RoundActionRequest;
};

/** A Play API route that carries a signed action. */
export type Route = (
  transport: Transport,
  body: RoundActionRequest,
  options: { readonly authorization: Authorization },
) => Promise<PlayResult<unknown>>;

/** A validated Snapshot of a round (any status but `idle`). */
export type RoundSnapshot = Exclude<ValidSnapshot, { readonly status: "idle" }>;

/** A validated Snapshot, or `snapshot-rejected` (W-28). */
export const snapshotOf = (body: unknown): ValidSnapshot => {
  const result = validateSnapshot(body);
  if (!result.ok) throw new ShellError("snapshot-rejected");
  return result.value;
};

/** A validated Snapshot of a round, or `snapshot-rejected`. */
export const roundSnapshotOf = (body: unknown): RoundSnapshot => {
  const snapshot = snapshotOf(body);
  if (snapshot.status === "idle") throw new ShellError("snapshot-rejected");
  return snapshot;
};

/** A failure of a Play API call or of its answer, which the flow handles. */
export const isCallError = (error: unknown): error is Error =>
  error instanceof NetworkError ||
  error instanceof ProblemError ||
  error instanceof ProtocolError ||
  (error instanceof ShellError && error.code === "snapshot-rejected");

/** The codes after which a move or a cash-out is resynchronized (W-19). */
const RESYNC: ReadonlySet<string> = new Set([
  "INVALID_ARGUMENT",
  "STALE_ACTION",
]);

/** A 400 `INVALID_ARGUMENT` or a 409 `STALE_ACTION` (W-19). */
export const asksResync = (error: unknown): boolean =>
  error instanceof ProblemError && RESYNC.has(error.problem.code);

/**
 * The outcome of a signed action's call (a move, a cash-out, or the cancel) is
 * unknown, so its one resend may follow (W-16, W-25): no response, or a 503 the
 * server did not mark `retryable: false` (a problem that says `retryable:
 * true`, or a 503 with no problem body, which carries no `retryable` at all). A
 * 503 marked `retryable: false` is not an unknown outcome (no resend), as W-42
 * reads `retryable`; the cancel still reads after it (W-25; decided in human
 * review, 2026-10-18).
 */
export const isUnknownOutcome = (error: unknown): boolean =>
  error instanceof NetworkError ||
  (error instanceof ProblemError &&
    error.problem.status === 503 &&
    error.problem.retryable) ||
  (error instanceof ProtocolError && error.status === 503);

/**
 * For the cancel, a problem that is never proof of a refusal, whatever its
 * `retryable`, so the reads decide: a 503 (`UNAVAILABLE`; human review,
 * 2026-10-18) or a 500 `INTERNAL` (human review, 2026-10-19). The Play API
 * document (since se-backend 65504f5) says that after a lost response,
 * `UNAVAILABLE`, or `INTERNAL` the cancel may already have been taken. A 500
 * with another code is not.
 */
export const mayBeStored = (error: unknown): boolean =>
  error instanceof ProblemError &&
  (error.problem.status === 503 ||
    (error.problem.status === 500 && error.problem.code === "INTERNAL"));

/** A problem that refuses the call for good (not retryable). */
export const isRefusal = (error: unknown): boolean =>
  error instanceof ProblemError && !error.problem.retryable;

/** Whether two player messages are the same, field by field. */
const sameMessage = (a: PlayerMessage, b: PlayerMessage): boolean =>
  a.action === b.action &&
  a.sequence === b.sequence &&
  a.round === b.round &&
  a.previous === b.previous &&
  a.path.length === b.path.length &&
  a.path.every((node, i) => node === b.path[i]);

/**
 * Encodes the typed data of `message`, then signs it with `sign`, and returns
 * the action with its body. The encoder runs first, so one that throws leaves
 * nothing signed. Fails closed when the message signed is not the one the bytes
 * were encoded from, or the action signed is not of `kind`: it calls `fail`
 * (the round's transcript state takes no new signature and no resend) and
 * throws `invalid-input`, with nothing recorded or sent.
 */
export const signedBody = (
  encode: TypedDataEncoder,
  roundId: string,
  kind: PendingAction["kind"],
  message: PlayerMessage,
  sign: () => PendingAction,
  fail: () => void,
): Sent => {
  const typedData = typedDataOf(encode, { kind, message });
  const action = sign();
  if (action.kind !== kind || !sameMessage(action.message, message)) {
    fail();
    throw new ShellError("invalid-input");
  }
  return Object.freeze({
    action,
    body: Object.freeze({
      idempotencyKey: action.idempotencyKey,
      roundId,
      typedData,
      signature: action.signature,
    }),
  });
};
