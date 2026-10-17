// The operations' error cases: for each operation of the Play API document,
// how to call it, the problem statuses the document lists for it (with a code
// of each), and how to queue its answers on the fake Play API server.

import type { ErrorCode } from "@intraverse/se-client-contracts";

import {
  cancelRound,
  cashOutRound,
  continueRound,
  getSnapshot,
  redeemLaunchCode,
  refreshPlayToken,
  startRound,
} from "../operations.ts";
import type { PlayOperationId } from "../play-api.ts";
import { DEFAULT_RETRY_CONFIG } from "../retry.ts";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../transport.ts";
import type { Answer, ListedStatus } from "./fake-play-server.ts";
import {
  actionBody,
  FIXTURE_LAUNCH_CODE,
  idleSnapshot,
  redeemAnswer,
  refreshAnswer,
  startBody,
} from "./play-bodies.ts";
import type { ServerHarness } from "./server-harness.ts";
import { START_MS } from "./session.ts";

/** Long enough for every repeat of a call and its backoff. */
export const LONG_WAIT_MS: number =
  DEFAULT_RETRY_CONFIG.maxDelayMs * DEFAULT_RETRY_CONFIG.maxAttempts;

/** Long enough for one attempt to time out and its backoff to pass. */
export const TIMEOUT_WAIT_MS: number =
  DEFAULT_REQUEST_TIMEOUT_MS + LONG_WAIT_MS;

/** A code the document does not list: a newer backend's (W-42). */
export const UNKNOWN_CODE = "NEWER_BACKEND_CODE";

/** The operations whose class is `never`: one attempt, whatever the failure. */
const NEVER_REPEATED: ReadonlySet<PlayOperationId> = new Set([
  "redeemLaunchCode",
  "cancelRound",
]);

/** An answer that does not depend on the operation. */
type AnyAnswer = Extract<
  Answer<PlayOperationId>,
  { readonly kind: "network-failure" | "hang" | "garbage" }
>;

export type Case = {
  readonly id: PlayOperationId;
  /** How many attempts a repeatable failure gets. */
  readonly attempts: number;
  readonly call: (x: ServerHarness) => Promise<unknown>;
  /** The document's problem statuses of the operation, with a code of each. */
  readonly problems: readonly (readonly [number, ErrorCode])[];
  readonly queueProblem: (
    x: ServerHarness,
    status: number,
    code: string,
    retryable: boolean,
  ) => void;
  readonly queue: (x: ServerHarness, ...answers: readonly AnyAnswer[]) => void;
  /** A successful answer, after a repeat. */
  readonly queueSuccess: (x: ServerHarness) => void;
};

const operation = <Id extends PlayOperationId>(
  id: Id,
  call: Case["call"],
  problems: readonly (readonly [Exclude<ListedStatus<Id>, 200>, ErrorCode])[],
  success: Extract<Answer<Id>, { readonly kind: "success" }>,
): Case => ({
  id,
  attempts: NEVER_REPEATED.has(id) ? 1 : DEFAULT_RETRY_CONFIG.maxAttempts,
  call,
  problems,
  queueProblem: (x, status, code, retryable) => {
    // Only a status the document lists for the operation can be answered.
    const listed = problems.find(([known]) => known === status)?.[0];
    if (listed === undefined) {
      throw new Error(`${id} lists no ${String(status)} in the document`);
    }
    x.server.answer(id, { kind: "problem", status: listed, code, retryable });
  },
  queue: (x, ...answers) => {
    x.server.answer(id, ...answers);
  },
  queueSuccess: x => {
    x.server.answer(id, success);
  },
});

export const PROBLEMS = {
  redeemLaunchCode: [
    [400, "INVALID_ARGUMENT"],
    [401, "UNAUTHENTICATED"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
  refreshPlayToken: [
    [401, "SESSION_EXPIRED"],
    [404, "NOT_FOUND"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
  startRound: [
    [400, "INVALID_ARGUMENT"],
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [409, "STALE_ACTION"],
    [409, "ROUND_ACTIVE"],
    [422, "FAILED_PRECONDITION"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
    [503, "ENTROPY_UNAVAILABLE"],
  ],
  continueRound: [
    [400, "INVALID_ARGUMENT"],
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [409, "STALE_ACTION"],
    [422, "FAILED_PRECONDITION"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
  cashOutRound: [
    [400, "INVALID_ARGUMENT"],
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [409, "STALE_ACTION"],
    [422, "FAILED_PRECONDITION"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
  cancelRound: [
    [400, "INVALID_ARGUMENT"],
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [422, "FAILED_PRECONDITION"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
  getSnapshot: [
    [401, "SESSION_REVOKED"],
    [404, "NOT_FOUND"],
    [422, "FAILED_PRECONDITION"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ],
} as const;

const snapshotAnswer = { kind: "success", body: idleSnapshot } as const;

export const CASES: readonly Case[] = [
  operation(
    "redeemLaunchCode",
    x =>
      redeemLaunchCode(
        x.transport,
        { launchCode: FIXTURE_LAUNCH_CODE },
        { seal: x.seal, signal: x.cancel.signal },
      ),
    PROBLEMS.redeemLaunchCode,
    { kind: "success", body: redeemAnswer },
  ),
  operation(
    "refreshPlayToken",
    x =>
      refreshPlayToken(x.transport, {
        ...x.auth,
        seal: x.seal,
        signal: x.cancel.signal,
        notAfterMs: START_MS + LONG_WAIT_MS * 10,
      }),
    PROBLEMS.refreshPlayToken,
    { kind: "success", body: refreshAnswer },
  ),
  operation(
    "startRound",
    x =>
      startRound(x.transport, startBody, {
        ...x.auth,
        signal: x.cancel.signal,
      }),
    PROBLEMS.startRound,
    snapshotAnswer,
  ),
  operation(
    "continueRound",
    x =>
      continueRound(x.transport, actionBody, {
        ...x.auth,
        signal: x.cancel.signal,
      }),
    PROBLEMS.continueRound,
    snapshotAnswer,
  ),
  operation(
    "cashOutRound",
    x =>
      cashOutRound(x.transport, actionBody, {
        ...x.auth,
        signal: x.cancel.signal,
      }),
    PROBLEMS.cashOutRound,
    snapshotAnswer,
  ),
  operation(
    "cancelRound",
    x =>
      cancelRound(x.transport, actionBody, {
        ...x.auth,
        signal: x.cancel.signal,
      }),
    PROBLEMS.cancelRound,
    snapshotAnswer,
  ),
  operation(
    "getSnapshot",
    x => getSnapshot(x.transport, { ...x.auth, signal: x.cancel.signal }),
    PROBLEMS.getSnapshot,
    snapshotAnswer,
  ),
];

export type ProblemCase = Case & {
  readonly status: number;
  readonly code: ErrorCode;
};

/** Every problem case of every operation, flat, for `it.each`. */
export const PROBLEM_CASES: readonly ProblemCase[] = CASES.flatMap(c =>
  c.problems.map(([status, code]) => ({ ...c, status, code })),
);
