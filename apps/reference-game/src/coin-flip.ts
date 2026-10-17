// Coin Flip, read from the game's copy of a Snapshot. The round is one step with
// two options: option 0 is heads and option 1 is tails. What the player called
// is the step's `selectedIndex`; the side that lost is its `losingIndex`, so the
// coin landed on the other one. Any other configuration is not Coin Flip, and
// this sample does not play it.

import type {
  GameSnapshot,
  GameStep,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

export type Side = "heads" | "tails";

/** The sides by option index. */
export const SIDES: readonly Side[] = Object.freeze(["heads", "tails"]);

export const optionOf = (side: Side): number => SIDES.indexOf(side);

const sideAt = (option: number | undefined): Side | undefined =>
  option === undefined ? undefined : SIDES[option];

/** The round as the game shows it. */
export type CoinFlipRound = {
  readonly version: number;
  readonly status: RoundStatus;
  readonly expired: boolean;
  /** The step a pick names (the Snapshot's current `step`), when there is one. */
  readonly step: number | undefined;
  /** What a win pays, as a multiple of the bet (a display value, not money). */
  readonly multiplier: number;
  /** What the player called, once the Wrapper has it. */
  readonly call: Side | undefined;
  /** Where the coin landed, once it is revealed. */
  readonly landed: Side | undefined;
  /** Whether the round takes a pick now: active, on the coin's step, uncalled. */
  readonly open: boolean;
  readonly appearance: "dark" | "light" | undefined;
  readonly device: "desktop" | "mobile";
};

const coinStep = (snapshot: GameSnapshot): GameStep | undefined => {
  const { steps } = snapshot.config;
  const [step] = steps;
  return steps.length === 1 && step?.index === 0 && step.optionCount === 2
    ? step
    : undefined;
};

const landedOf = (
  status: RoundStatus,
  step: GameStep,
  call: Side | undefined,
): Side | undefined => {
  if (step.losingIndex !== undefined) return sideAt(1 - step.losingIndex);
  return status === "won" ? call : undefined;
};

/** The Coin Flip round of `snapshot`, or `undefined` when it is not one. */
export const coinFlipRound = (
  snapshot: GameSnapshot,
): CoinFlipRound | undefined => {
  const step = coinStep(snapshot);
  if (step === undefined) return undefined;
  const call = sideAt(step.selectedIndex);
  return Object.freeze({
    version: snapshot.version,
    status: snapshot.status,
    expired: snapshot.closeReason === "expired",
    step: snapshot.step,
    multiplier: step.multiplier,
    call,
    landed: landedOf(snapshot.status, step, call),
    open:
      snapshot.status === "active" &&
      snapshot.step === step.index &&
      call === undefined,
    appearance: snapshot.context.theme.appearance,
    device: snapshot.context.device,
  });
};
