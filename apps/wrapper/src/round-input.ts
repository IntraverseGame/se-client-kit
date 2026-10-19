// What the UI reads from a Snapshot and from a typed error, and the result of
// one Snapshot read. These are the UI's input port: the values are handed over
// already validated against `se.snapshot/1` (W-28), never parsed here. Each type
// is the read-only subset of the contract's type that the UI renders, so a
// validated Snapshot is assignable to it as it is (the component tests hold
// the golden vectors to that). The UI never reads a field it does not list
// here, so an absent field is never read as hidden state (W-29).

import { type CancelState, isRoundOver } from "@intraverse/se-client-shell";

export type { CancelState };

/** `Amount`: the fields used for a decision (`value`) and for display. */
export type ShownAmount = {
  /** Base units, base 10; compared only as `bigint` (W-34). */
  readonly value: string;
  readonly decimals: number;
  readonly unit: string;
  /** What the player sees (W-34, W-48). */
  readonly formatted: string;
};

export type RoundStatus =
  | "idle"
  | "starting"
  | "active"
  | "resolving"
  | "won"
  | "lost"
  | "canceled";

/** The fields that say whether a round is over, and whether it is polled. */
export type RoundProgress = {
  readonly status: RoundStatus;
  readonly closeReason?: "expired";
};

/**
 * Whether the round is over (W-39, W-40): the shell's `isRoundOver`, the one
 * place the kit decides it. The Wrapper keeps no status list of its own.
 */
export const roundIsOver = (snapshot: RoundProgress): boolean =>
  isRoundOver(snapshot);

/** The cancel states in which the round is not over (W-25). */
const HOLDING: ReadonlySet<CancelState> = new Set([
  "in-flight",
  "settling",
  "check-later",
]);

/**
 * Whether the round is over, with the shell's cancel state of it (W-25, W-33):
 * over once the cancel is `ended` (a neutral "round ended"), never while it is
 * `in-flight`, `settling`, or `check-later`, and otherwise `roundIsOver`.
 */
export const roundEnded = (
  snapshot: RoundProgress,
  cancel?: CancelState,
): boolean => {
  if (cancel === "ended") return true;
  if (cancel !== undefined && HOLDING.has(cancel)) return false;
  return roundIsOver(snapshot);
};

/**
 * How the Wrapper reads the Snapshot again (W-35): `fast`, with bounded backoff
 * and the slow rate; or `background`, one read every 30 s, while the cancel is
 * `check-later` or a move or cash-out is not confirmed (W-16).
 */
export type PollMode = "fast" | "background";

/**
 * How the Wrapper polls while it shows `snapshot`, with the shell's cancel
 * state of its round (W-35): fast while the cancel is `settling`, whatever the
 * status; in the background while it is `check-later`; not at all once it is
 * `ended`, `not-taken`, or `sent`; in the background while an `active` round's
 * move or cash-out is not confirmed (`unconfirmed`, W-16); otherwise fast while
 * the round is not over and waits on the server, not on the player (`starting`
 * and `resolving` today).
 */
export const pollModeOf = (
  snapshot: RoundProgress,
  cancel?: CancelState,
  unconfirmed = false,
): PollMode | undefined => {
  if (cancel === "settling") return "fast";
  if (cancel === "check-later") return "background";
  if (cancel === "ended" || cancel === "not-taken" || cancel === "sent") {
    return undefined;
  }
  if (unconfirmed && snapshot.status === "active") return "background";
  return snapshot.status !== "idle" &&
    snapshot.status !== "active" &&
    !roundIsOver(snapshot)
    ? "fast"
    : undefined;
};

/** Whether the Wrapper polls fast while it shows `snapshot` (W-35). */
export const isPolled = (
  snapshot: RoundProgress,
  cancel?: CancelState,
  unconfirmed = false,
): boolean => pollModeOf(snapshot, cancel, unconfirmed) === "fast";

export type SnapshotInput = {
  /** Per session, increasing; a lower one is a stale response (W-29). */
  readonly version: number;
  readonly status: RoundStatus;
  /** Shown beside the status, never a status of its own (W-33). */
  readonly closeReason?: "expired";
  /** UUIDv7 text; absent only when `idle`. */
  readonly roundId?: string;
  readonly context: {
    /** The session's language (W-48). */
    readonly language: string;
    readonly links?: {
      readonly lobby?: string;
      readonly deposit?: string;
    };
  };
  readonly bet: {
    readonly balance: ShownAmount;
    readonly minBet: ShownAmount;
    readonly maxBet: ShownAmount;
    readonly suggestedBets: readonly ShownAmount[];
    readonly defaultBet: ShownAmount;
  };
  /** For display only, never for money (W-34). */
  readonly currentMultiplier?: number;
};

/** A typed Play API error, validated (`PlayProblem`). */
export type ProblemInput = {
  /** One of the schema's closed `ErrorCode` list; the UI branches on it (W-42). */
  readonly code: string;
  readonly retryable: boolean;
  /** Shown in every error state, so support can find the call (W-41). */
  readonly requestId?: string;
  /** `ROUND_ACTIVE` only: the open round, validated with the problem. */
  readonly snapshot?: SnapshotInput;
};

/**
 * What the shell's checks say of the Snapshot's round (W-19, W-24, W-26), when
 * the shell holds it. A round it does not hold (one resumed from
 * `ROUND_ACTIVE`, W-42) has none: it is shown, and the player cannot move in
 * it.
 */
export type RoundCheck = {
  /**
   * `checking` until W-26 decided: the game is not shown as ready. `failed`
   * says what the player is shown.
   */
  readonly verdict:
    | "checking"
    | "ready"
    | "verification-failed"
    | "chain-unverified";
  /** W-19's out-of-sync state (W-44). */
  readonly outOfSync: boolean;
  /** The cash-out control is offered (W-24). */
  readonly cashOutOffered: boolean;
  /**
   * The required cancel's progress (W-25, W-33, W-35): `none` until it is
   * reached; `settling` and `check-later` are read again; `ended` is a neutral
   * "round ended"; `sent` with `canceled` is the round failed verification and
   * canceled (W-26).
   */
  readonly cancel: CancelState;
  /**
   * The round's move or cash-out whose one resend was lost too, neither applied
   * nor refused (W-16): "your move (or cash-out) hasn't been confirmed", read
   * in the background and on "check again" until a read settles it. Absent
   * otherwise.
   */
  readonly unconfirmed?: "move" | "cash-out";
};

/** The outcome of one Snapshot read, as the session hands it to the UI. */
export type SnapshotRead =
  /** A Snapshot that passed validation (W-28), with the shell's checks. */
  | {
      readonly kind: "snapshot";
      readonly snapshot: SnapshotInput;
      readonly check?: RoundCheck;
    }
  /** A typed error that passed validation (W-42). */
  | { readonly kind: "problem"; readonly problem: ProblemInput }
  /**
   * A response that failed validation, or that is not usable at all: it is not
   * rendered and not forwarded (W-28); the generic error state shows.
   */
  | { readonly kind: "rejected" }
  /** No response: offline, DNS, TLS, reset, or the timeout (W-43). */
  | { readonly kind: "network" }
  /** The session ended (W-7): the key and the token are gone. */
  | { readonly kind: "session-ended" }
  /** The shell did not act on the player's request: nothing was sent. */
  | { readonly kind: "refused" };
