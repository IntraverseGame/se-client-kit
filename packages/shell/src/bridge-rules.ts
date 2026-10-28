// The game bridge's rules on a Snapshot (W-23, W-38, RFC-003): the copy the
// game is sent, and the pre-check of a pick against the latest Snapshot sent.
// Pure functions; the bridge (controller-bridge.ts) holds the state.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import {
  type GamePlaybackSnapshot,
  type GameSnapshot,
  type Pick,
  type RejectReason,
  toGameSnapshot,
} from "./controller-protocol.ts";
import { toPlaybackCopy } from "./playback-copy.ts";

/** A Snapshot whose copy was built, with that copy. */
export type HeldCopy = {
  readonly snapshot: ValidSnapshot;
  readonly copy: GameSnapshot | GamePlaybackSnapshot;
};

/**
 * The Snapshot's copy for the game: its `steps` copy, or its `playback` copy,
 * or `undefined` when a `playback` copy failed closed (playback-copy.ts).
 */
export const gameCopyOf = (
  snapshot: ValidSnapshot,
): GameSnapshot | GamePlaybackSnapshot | undefined => {
  if (snapshot.presentation === "playback") {
    const built = toPlaybackCopy(snapshot);
    return built.ok ? built.copy : undefined;
  }
  return toGameSnapshot(snapshot);
};

/**
 * The W-23 pre-check against the latest Snapshot sent to the game, in order: a
 * book round takes no pick (`not_legal`, before the status, so it never answers
 * `not_active`; W-51, RFC-003), then the status, then the step and the option.
 */
export const preCheck = (
  latest: ValidSnapshot | undefined,
  pick: Pick,
): RejectReason | undefined => {
  if (latest?.presentation === "playback") return "not_legal";
  if (latest?.status !== "active") return "not_active";
  if (latest.config.kind !== "steps" || latest.step !== pick.step) {
    return "not_legal";
  }
  const step = latest.config.steps.find(s => s.index === pick.step);
  if (step === undefined || pick.option >= step.optionCount) return "not_legal";
  return undefined;
};
