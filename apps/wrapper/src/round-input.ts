// What the UI reads from a Snapshot and from a typed error, and the result of
// one Snapshot read. These are the UI's input port: the values are handed over
// already validated against `se.snapshot/1` (W-28), never parsed here. Each type
// is the read-only subset of the contract's type that the UI renders, so a
// validated Snapshot is assignable to it as it is (the component tests hold
// the golden vectors to that). The UI never reads a field it does not list
// here, so an absent field is never read as hidden state (W-29).

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

/** The statuses that end a round (W-39). */
export const TERMINAL_STATUSES: ReadonlySet<RoundStatus> = new Set([
  "won",
  "lost",
  "canceled",
]);

/** The statuses the Wrapper polls in (W-35). */
export const POLLING_STATUSES: ReadonlySet<RoundStatus> = new Set([
  "starting",
  "resolving",
]);

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
  readonly bankedAmount?: ShownAmount;
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

/** The outcome of one Snapshot read, as the session hands it to the UI. */
export type SnapshotRead =
  /** A Snapshot that passed validation (W-28). */
  | { readonly kind: "snapshot"; readonly snapshot: SnapshotInput }
  /** A typed error that passed validation (W-42). */
  | { readonly kind: "problem"; readonly problem: ProblemInput }
  /**
   * A response that failed validation, or that is not usable at all: it is not
   * rendered and not forwarded (W-28); the generic error state shows.
   */
  | { readonly kind: "rejected" }
  /** No response: offline, DNS, TLS, reset, or the timeout (W-43). */
  | { readonly kind: "network" };
