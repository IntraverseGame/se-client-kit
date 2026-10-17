// The controller protocol `se.controller/1` (W-38): the closed message set
// between the Wrapper and the game, and the allow-list that builds the game's
// copy of a Snapshot. The copy is built field by field from the allow-list,
// never by removing fields, so a field the schema adds later never reaches the
// game until this list names it. The parser of what the game sends is in
// `game-message.ts`.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

/** The protocol's name and version, carried by every message. */
export const CONTROLLER_SCHEMA = "se.controller/1";

/** A presentation the game can declare (the Snapshot schema's list). */
export type Presentation = "steps" | "playback";

/** A round status the game can declare (the Snapshot schema's list). */
export type RoundStatus =
  | "idle"
  | "starting"
  | "active"
  | "resolving"
  | "won"
  | "lost"
  | "canceled";

export const PRESENTATIONS: ReadonlySet<string> = new Set<Presentation>([
  "steps",
  "playback",
]);

/** Every status, in the schema's order. A game must declare all seven. */
export const ROUND_STATUSES: readonly RoundStatus[] = Object.freeze([
  "idle",
  "starting",
  "active",
  "resolving",
  "won",
  "lost",
  "canceled",
] as const);

export const STATUSES: ReadonlySet<string> = new Set(ROUND_STATUSES);

/** Why an `action` request was not accepted: a closed list, never a message. */
export type RejectReason = "not_legal" | "not_active" | "busy" | "invalid";

/** Game to Wrapper: the game's capabilities. */
export type HelloMessage = {
  readonly schema: typeof CONTROLLER_SCHEMA;
  readonly type: "hello";
  readonly presentations: readonly Presentation[];
  readonly statuses: readonly RoundStatus[];
};

/** A pick: the step (its `Step.index`) and the option chosen in it. */
export type Pick = {
  readonly step: number;
  readonly option: number;
};

/** Game to Wrapper: a pick request. It is not an action (W-23). */
export type ActionMessage = {
  readonly schema: typeof CONTROLLER_SCHEMA;
  readonly type: "action";
  /** 1 to 64 characters from `[A-Za-z0-9_-]`, chosen by the game. */
  readonly id: string;
  readonly verb: "pick";
  readonly args: Pick;
};

/** One step of the game's copy of a Snapshot. */
export type GameStep = {
  readonly index: number;
  readonly optionCount: number;
  readonly multiplier: number;
  readonly selectedIndex?: number;
  readonly losingIndex?: number;
};

/**
 * The game's copy of a validated Snapshot of the `steps` presentation: only the
 * allow-listed fields. It has no proofs, no session id, no links, no amounts,
 * and no personalization; it is not an `se.snapshot/1` document.
 */
export type GameSnapshot = {
  readonly version: number;
  readonly presentation: "steps";
  readonly status: RoundStatus;
  readonly closeReason?: "expired";
  readonly roundId?: string;
  readonly step?: number;
  readonly currentMultiplier?: number;
  readonly context: {
    readonly language: string;
    readonly device: "desktop" | "mobile";
    readonly theme: { readonly appearance?: "dark" | "light" };
  };
  readonly config: {
    readonly kind: "steps";
    readonly steps: readonly GameStep[];
  };
};

/** Wrapper to game: a Snapshot that passed W-28, as its allow-listed copy. */
export type SnapshotMessage = {
  readonly schema: typeof CONTROLLER_SCHEMA;
  readonly type: "snapshot";
  readonly snapshot: GameSnapshot;
};

/** Wrapper to game: an `action` request that was not accepted. */
export type RejectMessage = {
  readonly schema: typeof CONTROLLER_SCHEMA;
  readonly type: "reject";
  readonly id: string;
  readonly reason: RejectReason;
};

/** A message the game may send. */
export type GameMessage = HelloMessage | ActionMessage;

/** A message the Wrapper sends to the game. */
export type WrapperMessage = SnapshotMessage | RejectMessage;

const gameStep = (step: {
  readonly index: number;
  readonly optionCount: number;
  readonly multiplier: number;
  readonly selectedIndex?: number;
  readonly losingIndex?: number;
}): GameStep =>
  Object.freeze({
    index: step.index,
    optionCount: step.optionCount,
    multiplier: step.multiplier,
    ...(step.selectedIndex === undefined
      ? {}
      : { selectedIndex: step.selectedIndex }),
    ...(step.losingIndex === undefined
      ? {}
      : { losingIndex: step.losingIndex }),
  });

/**
 * The game's copy of a validated Snapshot, built from the allow-list only
 * (W-38). A `playback` Snapshot has no copy (`undefined`): the first release
 * forwards only the `steps` presentation.
 */
export const toGameSnapshot = (
  snapshot: ValidSnapshot,
): GameSnapshot | undefined => {
  if (snapshot.presentation !== "steps" || snapshot.config.kind !== "steps") {
    return undefined;
  }
  const { appearance } = snapshot.context.theme;
  return Object.freeze({
    version: snapshot.version,
    presentation: "steps",
    status: snapshot.status,
    ...(snapshot.closeReason === undefined
      ? {}
      : { closeReason: snapshot.closeReason }),
    ...(snapshot.roundId === undefined ? {} : { roundId: snapshot.roundId }),
    ...(snapshot.step === undefined ? {} : { step: snapshot.step }),
    ...(snapshot.currentMultiplier === undefined
      ? {}
      : { currentMultiplier: snapshot.currentMultiplier }),
    context: Object.freeze({
      language: snapshot.context.language,
      device: snapshot.context.device,
      theme: Object.freeze(appearance === undefined ? {} : { appearance }),
    }),
    config: Object.freeze({
      kind: "steps",
      steps: Object.freeze(snapshot.config.steps.map(gameStep)),
    }),
  });
};
