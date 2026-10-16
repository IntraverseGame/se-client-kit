// The shapes of a round's transcript state: what a signed, unconfirmed action
// holds (W-15), the round's phases, and the provisional cancel encoding.

import type {
  Bytes32,
  PlayerMessage,
  Signature,
} from "@intraverse/se-client-signing";

import type { PendingKind } from "./snapshot-reading.ts";

/**
 * The struct hash of a `PlayerCancel` message. PROVISIONAL: `signing` does not
 * encode `PlayerCancel` until a published contract defines its type string and
 * an independent vector pins it, so the encoding is injected; without one, the
 * shell refuses to sign a cancel.
 */
export type CancelHasher = (message: PlayerMessage) => Bytes32;

/** An action the shell signed and has not seen applied (W-15). */
export type PendingAction = {
  readonly kind: PendingKind;
  readonly message: PlayerMessage;
  /** `T` of this message: its struct hash. */
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
  /** The signed bytes: 65 bytes `r ‖ s ‖ v`. */
  readonly signature: Signature;
  /**
   * One per intent, reused for every resend of it (W-16, W-36): a UUID, 36
   * characters. PROVISIONAL: the limit of 1 to 128 characters comes from a Play
   * API document the kit has not vendored yet.
   */
  readonly idempotencyKey: string;
};

export type RoundPhase =
  /** The round takes signatures. */
  | "open"
  /**
   * `STALE_ACTION` was answered: nothing is signed until a Snapshot is read
   * (W-19).
   */
  | "stale"
  /**
   * After `STALE_ACTION`, the Snapshot showed the shell's action applied: the
   * outcome is adopted (`T` advanced to it), and the round still takes no new
   * signature (W-19 defines no resynchronization).
   */
  | "adopted"
  /**
   * The Snapshot did not show the shell's action applied after `STALE_ACTION`,
   * or showed an action it did not sign: the out-of-sync state (W-19, W-44).
   */
  | "out-of-sync"
  /** The round is over. */
  | "closed"
  /** The session ended. */
  | "ended";
