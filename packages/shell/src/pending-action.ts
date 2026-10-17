// The shapes of a round's transcript state: what a signed, unconfirmed action
// holds (W-15), the round's phases, and the injected cancel encoding.

import type {
  Bytes32,
  PlayerMessage,
  Signature,
  TranscriptRequest,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { PendingKind, SnapshotReading } from "./snapshot-reading.ts";

/**
 * The struct hash of a `PlayerCancel` message. The type is final in the
 * signed-action specification (the fields of `PlayerAction`), but `signing`
 * does not encode it until an independent signer's vector pins it (#41), so the
 * encoding is injected; without one, the shell refuses to sign a cancel.
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
   * characters, inside the Play API document's limit of 1 to 128.
   */
  readonly idempotencyKey: string;
};

export type RoundPhase =
  /** The round takes signatures. */
  | "open"
  /**
   * A move or a cash-out was answered 400 `INVALID_ARGUMENT` or 409
   * `STALE_ACTION`: nothing is signed or resent until a Snapshot of the round
   * decides (W-19).
   */
  | "stale"
  /**
   * After `stale`, the Snapshot showed the shell's own action applied: `T`
   * advanced to it, and the round signs again from the next sequence (W-19).
   * Nothing is ever signed again at the refused sequence.
   */
  | "adopted"
  /**
   * The round's `CreateRoundAuth` was re-issued (W-26): no new signature, not
   * even a cancel, while a W-16 resend of a move or a cash-out already signed
   * still goes out.
   */
  | "reissued"
  /**
   * The round failed verification (W-26) for another reason than a re-issue:
   * nothing more is signed for it (the one required cancel, if any, is already
   * signed), and nothing is resent.
   */
  | "failed"
  /**
   * The Snapshot did not show the shell's action applied after `stale`, or
   * showed an action it did not sign: the out-of-sync state (W-19, W-44).
   */
  | "out-of-sync"
  /** The round is over. */
  | "closed"
  /** The session ended. */
  | "ended";

/** One round's transcript state (round-signer.ts). */
export type RoundSigner = {
  /** The Snapshot `roundId` of the round. */
  readonly roundId: string;
  /** The round id as the signed messages carry it. */
  readonly round: Bytes32;
  readonly phase: () => RoundPhase;
  /** The last accepted `T` (`T_0` until the first applied action). */
  readonly last: () => Bytes32;
  /** The sequence of the next new signature. */
  readonly nextSequence: () => number;
  /** The signed action awaiting its outcome, if any. */
  readonly pending: () => PendingAction | undefined;
  /**
   * The pending move or cash-out when a W-16 resend of it may go out: in the
   * `open`, `adopted`, and `reissued` phases. Never a cancel (a cancel is sent
   * again only after a Snapshot read, W-25), and nothing while `stale`.
   */
  readonly resendable: () => PendingAction | undefined;
  /**
   * Signs a move or a cash-out at the next sequence and records it, with a new
   * idempotency key, before it returns: the caller sends only what this
   * returned. While an action is pending, the same request returns the same
   * action (the same bytes and key) and any other request throws
   * `equivocation`, as does a call made while another `sign` or `signCancel`
   * runs (from inside an injected function).
   */
  readonly sign: (request: TranscriptRequest) => PendingAction;
  /**
   * Signs `PlayerCancel` (`action = "cancel"`, empty path, sequence 1,
   * `previous = T_0`, W-25). Throws `equivocation` once a move is signed; a
   * move asked after it throws `equivocation` too (W-17). A call made while
   * another `sign` or `signCancel` runs throws `equivocation`.
   */
  readonly signCancel: () => PendingAction;
  /**
   * Reads a validated Snapshot: `T` advances only when it shows the pending
   * move applied (W-18). After `stale`, a Snapshot of this round that shows the
   * shell's own action applied is adopted, and the round signs again from the
   * next sequence; one that does not puts the round out of sync for good. A
   * `resolving` Snapshot decides nothing (W-19).
   */
  readonly observe: (snapshot: ValidSnapshot) => SnapshotReading;
  /**
   * The pending move or cash-out was answered 400 `INVALID_ARGUMENT` or 409
   * `STALE_ACTION`: hold all signing for the round, the resend included, until
   * a Snapshot decides (W-19).
   */
  readonly stale: () => void;
  /**
   * The round's `CreateRoundAuth` was re-issued (W-26): nothing new is signed
   * for the round from now on, not even a cancel; `resendable` still gives a
   * move or a cash-out already signed.
   */
  readonly reissue: () => void;
  /**
   * The round failed verification (W-26): no new signature for it from now on,
   * and no resend. A no-op once the round is closed or out of sync.
   */
  readonly fail: () => void;
};
