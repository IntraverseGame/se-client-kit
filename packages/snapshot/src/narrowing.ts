// Types that a validated document is known to have. The generated contract
// types (`Snapshot`, `PlayProblem`) are flat: they cannot express the schema's
// conditional rules (`if`/`then`, `not`). The validator checks those rules, so
// a value it accepts also has one of the shapes below; switching on `status` or
// `code` narrows to the fields that status or code carries.

import type {
  BookConfig,
  ErrorCode,
  FairnessContext,
  Hash32,
  PlayProblem,
  RandomnessProof,
  RoundId,
  Snapshot,
  StepConfig,
} from "@intraverse/se-client-contracts";

/** No play has happened in the round yet: no progress, multiplier, or bank. */
type BeforePlay = {
  step?: never;
  currentMultiplier?: never;
  bankedAmount?: never;
};

/** A round that is not terminal has no close reason (blindness). */
type NotClosed = { closeReason?: never };

type InRound = { roundId: RoundId };

/**
 * `payout` is what a finished round credits: the schema allows it on `won` and
 * `lost` only, so every other status carries none.
 */
type NoPayout = { payout?: never };

/** From `active` on, a round carries its proofs. */
type WithProofs = { proofs: FairnessContext };

/** A `won` or `lost` round carries the revealed round secret. */
type Revealed = {
  proofs: FairnessContext & {
    randomnessProof: RandomnessProof & { roundSecret: Hash32 };
  };
};

/** No round in front of the player, so no round-scoped field. */
export type IdleSnapshot = Snapshot &
  BeforePlay &
  NotClosed &
  NoPayout & { status: "idle"; roundId?: never; proofs?: never };

/** The round is being prepared; proofs fill in by phase, so they are optional. */
export type StartingSnapshot = Snapshot &
  BeforePlay &
  NotClosed &
  NoPayout &
  InRound & { status: "starting" };

export type ActiveSnapshot = Snapshot &
  NotClosed &
  NoPayout &
  InRound &
  WithProofs & { status: "active" };

export type ResolvingSnapshot = Snapshot &
  NotClosed &
  NoPayout &
  InRound &
  WithProofs & { status: "resolving" };

export type WonSnapshot = Snapshot & InRound & Revealed & { status: "won" };

export type LostSnapshot = Snapshot & InRound & Revealed & { status: "lost" };

/** A canceled round's bet is returned, not paid: it carries no `payout`. */
export type CanceledSnapshot = Snapshot &
  NoPayout &
  InRound &
  WithProofs & { status: "canceled" };

/** A Snapshot the validator accepted; `status` discriminates it. */
export type ValidSnapshot =
  | IdleSnapshot
  | StartingSnapshot
  | ActiveSnapshot
  | ResolvingSnapshot
  | WonSnapshot
  | LostSnapshot
  | CanceledSnapshot;

/** The `steps` presentation: the config is a `StepConfig`. */
export type StepsPresentation = { presentation: "steps"; config: StepConfig };

/** The `playback` presentation: a book round with a `BookConfig`, no `step`. */
export type PlaybackPresentation = {
  presentation: "playback";
  model: "book";
  config: BookConfig;
  step?: never;
};

/** Narrows a validated Snapshot to the `steps` presentation. */
export const isStepsPresentation = <S extends ValidSnapshot>(
  snapshot: S,
): snapshot is S & StepsPresentation => snapshot.presentation === "steps";

/** Narrows a validated Snapshot to the `playback` presentation. */
export const isPlaybackPresentation = <S extends ValidSnapshot>(
  snapshot: S,
): snapshot is S & PlaybackPresentation => snapshot.presentation === "playback";

/**
 * The codes the contract marks retryable. `retryable` is `true` for each of
 * them, except `UNAVAILABLE`, which is retryable by default but may be `false`
 * (a call that is never repeated, the launch-code redeem, sends `false`).
 */
export type RetryableErrorCode =
  | "FUNDING_UNCONFIRMED"
  | "ENTROPY_UNAVAILABLE"
  | "PREPARATION_TIMEOUT"
  | "LANE_LIMIT"
  | "ROUND_VOIDED"
  | "UNAVAILABLE";

/** `ROUND_ACTIVE` carries the open round's Snapshot, itself validated. */
export type RoundActiveProblem = PlayProblem & {
  code: "ROUND_ACTIVE";
  retryable: false;
  snapshot: ValidSnapshot;
};

export type RetryableProblem = PlayProblem & {
  snapshot?: never;
} & (
    | { code: Exclude<RetryableErrorCode, "UNAVAILABLE">; retryable: true }
    | { code: "UNAVAILABLE"; retryable: boolean }
  );

export type NonRetryableProblem = PlayProblem & {
  code: Exclude<ErrorCode, RetryableErrorCode | "ROUND_ACTIVE">;
  retryable: false;
  snapshot?: never;
};

/** A typed Play API error the validator accepted; `code` discriminates it. */
export type ValidPlayProblem =
  | RoundActiveProblem
  | RetryableProblem
  | NonRetryableProblem;
