// A `steps` round that is not Coin Flip (Cash or Crash `[3,3,4]` is the one the
// kit tests it on), read from the game's copy of a Snapshot. The config lists
// the rows: a step per row, `optionCount` tiles in it. A row the player has
// passed has its `selectedIndex` (the tile picked), and a row that is revealed
// has its `losingIndex` (the tile that ends the round). The row being played is
// the Snapshot's `step`. Cashing out is the Wrapper's control (W-24), not the
// game's: the game only picks a tile.

import type {
  GameSnapshot,
  GameStep,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

/** The round as the game shows it, row by row. */
export type StepsRound = {
  readonly version: number;
  readonly status: RoundStatus;
  readonly expired: boolean;
  /** The row being played (the Snapshot's `step`), when there is one. */
  readonly step: number | undefined;
  /** What the round has earned so far, as a multiple of the bet (display only). */
  readonly currentMultiplier: number | undefined;
  readonly steps: readonly GameStep[];
  /** Whether the round takes a pick now: active, on a row with no tile picked. */
  readonly open: boolean;
  readonly appearance: "dark" | "light" | undefined;
  readonly device: "desktop" | "mobile";
};

/** The row of `snapshot` that a pick names, when it takes one. */
const openRow = (snapshot: GameSnapshot): GameStep | undefined => {
  if (snapshot.status !== "active" || snapshot.step === undefined) {
    return undefined;
  }
  const row = snapshot.config.steps.find(
    candidate => candidate.index === snapshot.step,
  );
  return row?.selectedIndex === undefined ? row : undefined;
};

/** The steps round of `snapshot`, or `undefined` when it has no rows. */
export const stepsRound = (snapshot: GameSnapshot): StepsRound | undefined => {
  const { steps } = snapshot.config;
  if (steps.length === 0) return undefined;
  return Object.freeze({
    version: snapshot.version,
    status: snapshot.status,
    expired: snapshot.closeReason === "expired",
    step: snapshot.step,
    currentMultiplier: snapshot.currentMultiplier,
    steps,
    open: openRow(snapshot) !== undefined,
    appearance: snapshot.context.theme.appearance,
    device: snapshot.context.device,
  });
};
