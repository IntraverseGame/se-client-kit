// The Wrapper UI's read-only use case: the session's Snapshot, read from the
// Play API and validated (W-28), or the typed Play API error, validated, that
// answered instead (W-42). The UI renders only what passed validation: a
// response that did not is `rejected` and is not forwarded, and no response
// at all is `network` (W-43). Nothing here holds or returns a key, a token, or
// a signing capability; the play token reaches the call only through the
// injected `Authorization`, which the reader never calls itself.

import {
  type Authorization,
  getSnapshot,
  NetworkError,
  ProblemError,
  ProtocolError,
  type Transport,
} from "@intraverse/se-client-play-client";
import type {
  ValidPlayProblem,
  ValidSnapshot,
} from "@intraverse/se-client-snapshot";

import {
  validateSessionProblem,
  validateSessionSnapshot,
} from "./book-status.ts";
import { redacting } from "./redaction.ts";

export type { ValidPlayProblem, ValidSnapshot };

/** The outcome of one Snapshot read, as the UI receives it. */
export type SnapshotRead =
  /** A Snapshot that passed validation (W-28). */
  | { readonly kind: "snapshot"; readonly snapshot: ValidSnapshot }
  /** A typed error that passed validation (W-42). */
  | { readonly kind: "problem"; readonly problem: ValidPlayProblem }
  /** A response that failed validation, or no usable one: not rendered. */
  | { readonly kind: "rejected" }
  /** No response: offline, DNS, TLS, reset, or the timeout (W-43). */
  | { readonly kind: "network" };

export type SnapshotReaderOptions = {
  readonly transport: Transport;
  /** The play token's `Authorization` value, read once per attempt. */
  readonly authorization: Authorization;
};

export type SnapshotReader = {
  /** Reads the session's Snapshot (`getSnapshot`) and classifies the outcome. */
  readonly read: () => Promise<SnapshotRead>;
  /** The latest Snapshot a read validated, if any. */
  readonly latest: () => ValidSnapshot | undefined;
};

const REJECTED: SnapshotRead = Object.freeze({ kind: "rejected" });
const NETWORK: SnapshotRead = Object.freeze({ kind: "network" });

/** A response body that should be a Snapshot, validated. */
export const snapshotReadOf = (body: unknown): SnapshotRead => {
  const result = validateSessionSnapshot(body);
  return result.ok
    ? Object.freeze({ kind: "snapshot", snapshot: result.value })
    : REJECTED;
};

/**
 * A failed Play API call, classified: a problem body that validates is the
 * typed error; a lost response is `network`; anything else is `rejected`.
 * Throws what is not a Play API client error.
 */
export const snapshotReadOfError = (error: unknown): SnapshotRead => {
  if (error instanceof NetworkError) return NETWORK;
  if (error instanceof ProblemError) {
    const problem = validateSessionProblem(error.body);
    return problem.ok
      ? Object.freeze({ kind: "problem", problem: problem.value })
      : REJECTED;
  }
  if (error instanceof ProtocolError) return REJECTED;
  throw error;
};

/** The UI's Snapshot reader. */
export const createSnapshotReader = (
  options: SnapshotReaderOptions,
): SnapshotReader => {
  let latest: ValidSnapshot | undefined;
  const read = async (): Promise<SnapshotRead> => {
    let outcome: SnapshotRead;
    try {
      const result = await getSnapshot(options.transport, {
        authorization: options.authorization,
      });
      outcome = snapshotReadOf(result.body);
    } catch (error) {
      outcome = snapshotReadOfError(error);
    }
    if (outcome.kind === "snapshot") latest = outcome.snapshot;
    return outcome;
  };
  return redacting({ read, latest: (): ValidSnapshot | undefined => latest });
};
