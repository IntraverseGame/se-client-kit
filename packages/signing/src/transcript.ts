// The transcript chain of one round: `T_0, T_1, ...`, where `T_n` is the
// struct hash of the n-th signed message and each message's `previous` is the
// `T` before it. It guarantees one signature per (round, sequence).

import { typedDataDigest } from "./eip712.ts";
import { SigningError } from "./errors.ts";
import { type Bytes32, decodeHex } from "./hex.ts";
import {
  hashPlayerAction,
  hashPlayerCashOut,
  type PlayerMessage,
} from "./messages.ts";
import type { Signature } from "./signature.ts";

/** Which message type a transcript entry is signed as. */
export type PlayerMessageKind = "action" | "cash-out";

/**
 * What the caller asks to sign; the transcript adds `sequence`, `round`, and
 * `previous`.
 */
export type TranscriptRequest = {
  readonly kind: PlayerMessageKind;
  readonly action: string;
  readonly path: readonly number[];
};

/** A signed message that has not been confirmed as applied. */
export type SignedEntry = {
  readonly kind: PlayerMessageKind;
  readonly message: PlayerMessage;
  /** `T` of this message: its struct hash. */
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
  readonly signature: Signature;
};

export type TranscriptOptions = {
  readonly domainSeparator: Bytes32;
  /** The round id (the `round` field of every message). */
  readonly round: Bytes32;
  /** `T_0`, the hash the first message links to. */
  readonly initial: Bytes32;
};

export type Transcript = {
  readonly round: Bytes32;
  /** The last accepted `T` (`T_0` until the first confirmation). */
  readonly last: () => Bytes32;
  /** The sequence the next signed message gets (1 for the first). */
  readonly nextSequence: () => number;
  /** The signed message awaiting confirmation, if any. */
  readonly pending: () => SignedEntry | undefined;
  /**
   * Sign `request` at the next sequence with `previous` = the last `T`. If a
   * message is already pending at that sequence, the same request returns the
   * same entry (the same bytes, for a resend) and any other request throws
   * `equivocation`: two different messages are never signed at one sequence. A
   * call made from inside the `sign` callback also throws `equivocation`.
   */
  readonly sign: (
    request: TranscriptRequest,
    sign: (digest: Bytes32) => Signature,
  ) => SignedEntry;
  /**
   * Record that the pending message was applied: its `T` becomes the last `T`
   * and the sequence advances. Throws `nothing-pending` without one.
   */
  readonly confirm: () => void;
};

const hashFor = (kind: PlayerMessageKind, message: PlayerMessage): Bytes32 =>
  kind === "action" ? hashPlayerAction(message) : hashPlayerCashOut(message);

export const createTranscript = (options: TranscriptOptions): Transcript => {
  const { domainSeparator, round } = options;
  for (const value of [domainSeparator, round, options.initial]) {
    decodeHex(value, 32);
  }

  let last = options.initial;
  let sequence = 1;
  let pending: SignedEntry | undefined;
  // Set while the caller's sign callback runs: a call that re-enters `sign`
  // then would find no pending entry and could sign a second message at the
  // same sequence, so it is refused.
  let signing = false;

  return Object.freeze({
    round,
    last: (): Bytes32 => last,
    nextSequence: (): number => sequence,
    pending: (): SignedEntry | undefined => pending,
    sign: (
      request: TranscriptRequest,
      sign: (digest: Bytes32) => Signature,
    ): SignedEntry => {
      if (signing) throw new SigningError("equivocation");
      const message: PlayerMessage = {
        action: request.action,
        path: Object.freeze([...request.path]),
        sequence,
        round,
        previous: last,
      };
      const structHash = hashFor(request.kind, message);
      if (pending !== undefined) {
        if (
          pending.kind === request.kind &&
          pending.structHash === structHash
        ) {
          return pending;
        }
        throw new SigningError("equivocation");
      }
      // The sequence was range-checked as a uint32 by the struct hash above.
      const digest = typedDataDigest(domainSeparator, structHash);
      let signature: Signature;
      signing = true;
      try {
        signature = sign(digest);
      } finally {
        signing = false;
      }
      const entry: SignedEntry = Object.freeze({
        kind: request.kind,
        message: Object.freeze(message),
        structHash,
        digest,
        signature,
      });
      pending = entry;
      return entry;
    },
    confirm: (): void => {
      if (pending === undefined) throw new SigningError("nothing-pending");
      last = pending.structHash;
      sequence += 1;
      pending = undefined;
    },
  });
};
