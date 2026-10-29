// One function per Play API operation, on the request layer. Each names its
// route from the document (play-api.ts), its retry class, and its
// credential. A Snapshot answer stays `unknown`: only the `snapshot` package's
// validator turns it into a typed value. The two token answers are read here,
// since the shell needs their fields; anything else in them is dropped, and
// the new play token is handed to the caller's `seal` at once: only the sealed
// value is returned, so the plain token is never returned, kept, or logged.

import type { CancelSignal } from "./platform.ts";
import {
  PLAY_ROUTES,
  type PlayOperationId,
  type RedeemLaunchCodeRequest,
  type RedeemLaunchCodeResponse,
  type RefreshPlayTokenResponse,
  type RoundActionRequest,
  type StartRoundRequest,
} from "./play-api.ts";
import { ProtocolError } from "./protocol-error.ts";
import { isGameOrigin, isGamePath } from "./redeem-fields.ts";
import type { RetryClass } from "./retry.ts";
import { parseDeadline } from "./token-schedule.ts";
import type { Authorization, PlayResponse, Transport } from "./transport.ts";

/** An operation's answer: its body, and when and how it arrived (W-6). */
export type PlayResult<Body> = {
  readonly body: Body;
  /** The local clock when the response arrived. */
  readonly receivedAtMs: number;
  /** `server - local`, from the response's `Date` header (W-6). */
  readonly clockOffsetMs: number | undefined;
};

export type CallOptions = {
  /** Aborting it ends the call with a `NetworkError` (`aborted`). */
  readonly signal?: CancelSignal;
};

/** A call that presents the play token, read once per attempt. */
export type AuthorizedCallOptions = CallOptions & {
  readonly authorization: Authorization;
};

/**
 * Turns the plain play token into the caller's sealed value (the shell's
 * `sealSecret("play-token", token)`, which prints `[redacted]`). It is called
 * once, with the token of a valid answer, before the answer is returned.
 */
export type Seal<S> = (token: string) => S;

/** A token answer with its `playToken` replaced by the sealed value. */
export type Sealed<Answer extends { readonly playToken: string }, S> = Omit<
  Answer,
  "playToken"
> & { readonly playToken: S };

export type RedeemCallOptions<S> = CallOptions & {
  readonly seal: Seal<S>;
};

export type RefreshCallOptions<S> = AuthorizedCallOptions & {
  readonly seal: Seal<S>;
  /**
   * The presented token's deadline in the local clock (`localDeadlineMs`): no
   * repeat starts at or after it (W-7).
   */
  readonly notAfterMs: number;
};

const SESSION_ID = /^ses_[0-9a-f]{32}$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

const isToken = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isDeadline = (value: unknown): value is string =>
  parseDeadline(value) !== undefined;

const result = <Body>(response: PlayResponse, body: Body): PlayResult<Body> =>
  Object.freeze({
    body,
    receivedAtMs: response.receivedAtMs,
    clockOffsetMs: response.clockOffsetMs,
  });

const mismatch = (id: PlayOperationId, status: number): ProtocolError =>
  new ProtocolError(
    PLAY_ROUTES[id],
    status,
    "the response does not match the Play API document",
  );

/**
 * Exchanges the launch code for the session's first play token
 * (`redeemLaunchCode`, W-1, W-2). It sends no credential, and it is never
 * repeated: the code is single use, so a lost or failed redeem needs a new
 * launch. Throws a `ProtocolError` when the answer lacks a field the shell
 * needs (`sessionId` as `ses_` and 32 hex digits, a non-empty `playToken`, both
 * deadlines as RFC 3339 timestamps with a zone, and `gameOrigin` of 1 to 267
 * characters), or a `gamePath` that breaks the document's rule; an answer
 * without `gamePath` is returned without one (the origin's root). The token is
 * returned only as `options.seal` made it.
 */
export const redeemLaunchCode = async <S>(
  transport: Transport,
  body: RedeemLaunchCodeRequest,
  options: RedeemCallOptions<S>,
): Promise<PlayResult<Sealed<RedeemLaunchCodeResponse, S>>> => {
  const response = await transport.send({
    ...PLAY_ROUTES.redeemLaunchCode,
    body,
    retry: "never",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const answer = response.body;
  if (!isRecord(answer)) throw mismatch("redeemLaunchCode", response.status);
  const sessionId = field(answer, "sessionId");
  const playToken = field(answer, "playToken");
  const tokenExpiresAt = field(answer, "tokenExpiresAt");
  const sessionExpiresAt = field(answer, "sessionExpiresAt");
  const gameOrigin = field(answer, "gameOrigin");
  const gamePath = field(answer, "gamePath");
  if (
    typeof sessionId !== "string" ||
    !SESSION_ID.test(sessionId) ||
    !isToken(playToken) ||
    !isDeadline(tokenExpiresAt) ||
    !isDeadline(sessionExpiresAt) ||
    !isGameOrigin(gameOrigin) ||
    (gamePath !== undefined && !isGamePath(gamePath))
  ) {
    throw mismatch("redeemLaunchCode", response.status);
  }
  return result(
    response,
    Object.freeze({
      sessionId,
      playToken: options.seal(playToken),
      tokenExpiresAt,
      sessionExpiresAt,
      gameOrigin,
      ...(gamePath === undefined ? {} : { gamePath }),
    }),
  );
};

/**
 * Exchanges the presented play token for a new one (`refreshPlayToken`, W-6,
 * W-7). It sends no body. A lost response or a retryable problem is repeated
 * with the same token while it is valid (`notAfterMs`). Throws a
 * `ProtocolError` when the answer lacks a non-empty `playToken` or an RFC 3339
 * `tokenExpiresAt` with a zone. The new token is returned only as
 * `options.seal` made it.
 */
export const refreshPlayToken = async <S>(
  transport: Transport,
  options: RefreshCallOptions<S>,
): Promise<PlayResult<Sealed<RefreshPlayTokenResponse, S>>> => {
  const response = await transport.send({
    ...PLAY_ROUTES.refreshPlayToken,
    authorization: options.authorization,
    retry: "refresh",
    notAfterMs: options.notAfterMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const answer = response.body;
  if (!isRecord(answer)) throw mismatch("refreshPlayToken", response.status);
  const playToken = field(answer, "playToken");
  const tokenExpiresAt = field(answer, "tokenExpiresAt");
  if (!isToken(playToken) || !isDeadline(tokenExpiresAt)) {
    throw mismatch("refreshPlayToken", response.status);
  }
  return result(
    response,
    Object.freeze({ playToken: options.seal(playToken), tokenExpiresAt }),
  );
};

const snapshotCall = async (
  transport: Transport,
  id: PlayOperationId,
  options: AuthorizedCallOptions,
  // A refresh names its deadline and is not a Snapshot call.
  retry: Exclude<RetryClass, "refresh">,
  body?: StartRoundRequest | RoundActionRequest,
): Promise<PlayResult<unknown>> => {
  const response = await transport.send({
    ...PLAY_ROUTES[id],
    authorization: options.authorization,
    retry,
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  return result(response, response.body);
};

/**
 * Starts a round (`startRound`, W-16). The body carries the intent's
 * `idempotencyKey`; a lost response or a retryable `UNAVAILABLE` is repeated
 * with the same bytes (retry class `start`). A start voided or refused before
 * any money moved (`FUNDING_UNCONFIRMED`, `ENTROPY_UNAVAILABLE`,
 * `PREPARATION_TIMEOUT`, `ROUND_VOIDED`) is answered once, whatever its
 * `retryable`: the document says to retry it with a new key, which is the
 * player's choice. After a lost response, `UNAVAILABLE`, or `INTERNAL` the
 * round may already have been started, and the same key and body answer it (the
 * caller decides whether to send them again). Answers the round's Snapshot as
 * `unknown`.
 */
export const startRound = (
  transport: Transport,
  body: StartRoundRequest,
  options: AuthorizedCallOptions,
): Promise<PlayResult<unknown>> =>
  snapshotCall(transport, "startRound", options, "start", body);

/**
 * Passes a signed move (`continueRound`), repeated as a read is (retry class
 * `idempotent`). After a lost response, `UNAVAILABLE`, or `INTERNAL` the move
 * may already have been taken, and the same request (key and signed action)
 * answers the round (the caller decides whether to send it again). Answers the
 * round's Snapshot as `unknown`.
 */
export const continueRound = (
  transport: Transport,
  body: RoundActionRequest,
  options: AuthorizedCallOptions,
): Promise<PlayResult<unknown>> =>
  snapshotCall(transport, "continueRound", options, "idempotent", body);

/**
 * Passes a signed cash-out (`cashOutRound`), repeated as `continueRound` is,
 * with its rules. Answers the round's Snapshot as `unknown`.
 */
export const cashOutRound = (
  transport: Transport,
  body: RoundActionRequest,
  options: AuthorizedCallOptions,
): Promise<PlayResult<unknown>> =>
  snapshotCall(transport, "cashOutRound", options, "idempotent", body);

/**
 * Passes a signed cancel (`cancelRound`, W-25). It is never repeated: a cancel
 * is not answered from a log as a repeated move is (once the engine took it,
 * the same cancel again is `FAILED_PRECONDITION`), so after a lost response,
 * `UNAVAILABLE`, or `INTERNAL` (the cancel may already have been taken) the
 * caller reads `getSnapshot` before it sends a cancel again. Answers the
 * round's Snapshot as `unknown`: `canceled` (final), `resolving` while the
 * engine has not answered the cancel yet, `active` with a move played when that
 * move won the race, or, when the engine had already closed the round, that
 * closure with no error (`won` or `lost` with its `payout`, or `canceled` with
 * `closeReason: "expired"`), never a cancel honored; a later read keeps showing
 * the round once it has ended (a round the engine cannot settle on its own
 * stays `resolving` until resolved manually). A cancel of a round that is not
 * `active` (one still `resolving` included) is `FAILED_PRECONDITION`.
 */
export const cancelRound = (
  transport: Transport,
  body: RoundActionRequest,
  options: AuthorizedCallOptions,
): Promise<PlayResult<unknown>> =>
  snapshotCall(transport, "cancelRound", options, "never", body);

/**
 * Reads the session's Snapshot (`getSnapshot`): its most recent round, an ended
 * one included, until the next `startRound` creates another; or `idle` when no
 * round has ended since the last start (none yet, or the last one was voided or
 * refused). The round and `bet.balance` are read apart, so `bet.balance` may be
 * newer than the round; the next read shows both. A read is repeated on a lost
 * response or a retryable problem. Answers the Snapshot as `unknown`.
 */
export const getSnapshot = (
  transport: Transport,
  options: AuthorizedCallOptions,
): Promise<PlayResult<unknown>> =>
  snapshotCall(transport, "getSnapshot", options, "idempotent");
