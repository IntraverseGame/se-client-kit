// What the session gives the Wrapper UI: use cases and read-only state. No
// type here holds a key, a token, the launch code, a signature, a transcript,
// or a signing capability.

import type { CancelState } from "./cancel-state.ts";
import type { FailReason } from "./chain-decision.ts";
import type {
  ControllerBridgeOptions,
  ControllerMountRefusal,
} from "./controller-bridge.ts";
import type { RejectReason } from "./controller-protocol.ts";
import type { ShellErrorCode } from "./errors.ts";
import type { Bet } from "./round-start.ts";
import type { SnapshotRead } from "./snapshot-read.ts";

/** Why no session opened, or the session that did. */
export type SessionOpening =
  /** The fragment held no launch code (W-1a): nothing was sent. */
  | { readonly kind: "no-launch-code" }
  /** The redeem was refused or got no answer; it is never repeated (W-2). */
  | { readonly kind: "redeem-failed" }
  /** Another tab holds the session's signer lock (W-14). */
  | { readonly kind: "other-tab" }
  /** The browser has no usable Web Locks API: nothing is signed (W-14). */
  | { readonly kind: "unsupported" }
  | { readonly kind: "open"; readonly session: PlaySession };

/** A use case's answer, as the UI renders it. */
export type SessionRead =
  | SnapshotRead
  /** The session ended (W-7): the key and the token are gone. */
  | { readonly kind: "session-ended" }
  /**
   * A Snapshot changed the session's presentation, model, `config.kind`, or
   * `config.model` (W-53): it was not read in, and from now until the page is
   * reloaded the session reads, signs, starts, and forwards nothing. Final, as
   * the states of W-44; the Wrapper shows "this round failed verification".
   */
  | { readonly kind: "session-changed" }
  /** The shell did not act: nothing was signed or sent. */
  | {
      readonly kind: "refused";
      readonly reason: RejectReason | ShellErrorCode;
    };

/** What the UI may know of the current round (read-only). */
export type RoundState = {
  readonly roundId: string;
  /**
   * `checking` until W-26 has decided; `ready` once every check passed (the
   * game may be shown as ready); `failed` with what the player is shown. A book
   * round, which W-26 does not apply to, is `ready` from its start unless it
   * changed (W-52: `failed`, "this round failed verification").
   */
  readonly verdict: "checking" | "ready" | "failed";
  /**
   * When `failed`: "this round failed verification" or "could not verify the
   * chain".
   */
  readonly shown?: FailReason;
  /** The round is out of sync (W-19, W-44). */
  readonly outOfSync: boolean;
  /** The cash-out control may be offered (W-24). */
  readonly cashOutOffered: boolean;
  /**
   * The required cancel's progress (W-25, W-33, W-35): `none` until it is
   * reached. While it is `in-flight`, `settling`, or `check-later` the round is
   * not over, whatever a Snapshot from elsewhere shows, and the Wrapper keeps
   * reading it (`settling`: the poll; `check-later`: "check again" and the
   * background read); `ended` is over, with no result claim ("round ended");
   * `not-taken` leaves the round open until its expiry rule closes it.
   */
  readonly cancel: CancelState;
  /**
   * Set while the pending move or cash-out had its one W-16 resend and that
   * resend was lost too, with the round still `active` and the action neither
   * applied nor refused: "your move (or cash-out) hasn't been confirmed".
   * Nothing more is sent or signed for it; only a read settles it (the
   * session's `checkAgain` is one), or the round ends by its expiry rule.
   * Absent otherwise.
   */
  readonly unconfirmed?: "move" | "cash-out";
  /**
   * The round signer's pending move or cash-out (never a cancel) while the
   * signer's phase is `open` or `adopted`: set from the signature, recorded
   * before its send (W-16), until a Snapshot shows the action applied; kept
   * beside `unconfirmed` after the lost resend. Absent otherwise: once a 400 or
   * 409 held signing (W-19), once the round is out of sync, re-issued, failed,
   * or over, and once the session has ended. The Wrapper's "Waiting for your
   * move to be confirmed." reads it (W-16). It carries no signature, key, or
   * bytes.
   */
  readonly pending?: "move" | "cash-out";
};

/**
 * The game frame's mount: the frame, its messages, and the incompatible-game
 * notice. The game origin, the allow-list, the Wrapper's own origin, the
 * configuration's `environment`, and the pick use case are the session's own,
 * fixed at open (W-37).
 */
export type GameMountOptions = Omit<
  ControllerBridgeOptions,
  "gameOrigin" | "gameOrigins" | "ownOrigin" | "environment" | "pick"
>;

export type GameMount =
  | {
      readonly ok: true;
      readonly gameOrigin: string;
      /** The path of the game's page on D, to frame D plus it (W-37). */
      readonly gamePath: string;
    }
  | {
      readonly ok: false;
      /** `session-ended`: the session ended, so it mounts no game (W-37). */
      readonly refusal: ControllerMountRefusal | "session-ended";
    };

export type PlaySession = {
  /**
   * Reads the session's Snapshot, validated, and lets the round's checks see
   * it. While the round's cancel is `settling` it is one of the cancel's
   * counted reads, and from `check-later` its "check again" read (W-35); while
   * the cancel is `in-flight`, `settling`, or `check-later` the answer is the
   * round's own latest Snapshot, never one from elsewhere (W-25).
   */
  readonly read: () => Promise<SessionRead>;
  /**
   * "Check again" (W-35): from `check-later`, one read under the cancel's
   * settling rules, which may settle it; otherwise the same as `read` (as for a
   * move or cash-out not confirmed, `RoundState.unconfirmed`: it only reads,
   * and sends nothing).
   */
  readonly checkAgain: () => Promise<SessionRead>;
  /** Starts a round with a bet copied from the Snapshot's `Amount` (W-22). */
  readonly start: (bet: Bet) => Promise<SessionRead>;
  /** Cashes out the current round, on the player's request only (W-24). */
  readonly cashOut: () => Promise<SessionRead>;
  readonly round: () => RoundState | undefined;
  /**
   * The game origin D of the launched game: the `sessions:redeem` answer's
   * `gameOrigin`, fixed at open (W-37). It is not yet checked: `mountGame`
   * checks it.
   */
  readonly gameOrigin: () => string;
  /**
   * Mounts the game's controller bridge for D, with the session's pick use
   * case, allow-list, and own origin (W-37).
   */
  readonly mountGame: (options: GameMountOptions) => GameMount;
  /** Answers that arrive outside a call of the UI (a game's pick). */
  readonly onChange: (listener: (read: SessionRead) => void) => () => void;
  /** Called once when the session ends (W-7). */
  readonly onEnd: (listener: () => void) => () => void;
  readonly ended: () => boolean;
  /** Ends the session: the key is destroyed and the token forgotten (W-11). */
  readonly end: () => void;
};
