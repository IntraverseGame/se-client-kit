// What the session gives the Wrapper UI: use cases and read-only state. No
// type here holds a key, a token, the launch code, a signature, a transcript,
// or a signing capability.

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
   * game may be shown as ready); `failed` with what the player is shown.
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
};

/**
 * The game frame's mount: the frame, its messages, and the incompatible-game
 * notice. The game origin, the allow-list, the Wrapper's own origin, and the
 * pick use case are the session's own, fixed at open (W-37).
 */
export type GameMountOptions = Omit<
  ControllerBridgeOptions,
  "gameOrigin" | "gameOrigins" | "ownOrigin" | "pick"
>;

export type GameMount =
  | { readonly ok: true; readonly gameOrigin: string }
  | {
      readonly ok: false;
      /** `no-game-origin`: the session has no game origin to mount (W-37). */
      readonly refusal: ControllerMountRefusal | "no-game-origin";
    };

export type PlaySession = {
  /**
   * Reads the session's Snapshot, validated, and lets the round's checks see
   * it.
   */
  readonly read: () => Promise<SessionRead>;
  /** Starts a round with a bet copied from the Snapshot's `Amount` (W-22). */
  readonly start: (bet: Bet) => Promise<SessionRead>;
  /** Cashes out the current round, on the player's request only (W-24). */
  readonly cashOut: () => Promise<SessionRead>;
  readonly round: () => RoundState | undefined;
  /** The game origin D of the launched game, if known (W-37). */
  readonly gameOrigin: () => string | undefined;
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
