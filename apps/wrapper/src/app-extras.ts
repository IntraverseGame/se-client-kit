// What the Wrapper app keeps for the bar of RFC-005 besides the round's state:
// the run of autoplay the shell reports (W-61), shown with the configuration's
// counts; and the session summary of the menu (RFC-005 section 8: the time
// since the session opened and the rounds played), kept in memory only, never
// stored, logged, or sent. Under autoplay the player's start of the run is the
// act for every round of it, so each round's id and link replace the last
// one's with no new act (W-40, W-61).

import type { AutoplayConfig } from "./autoplay-config.ts";
import type { AutoplayView, SessionSummary } from "./view-options.ts";
import { leaveEndedRound, type WrapperState } from "./wrapper-state.ts";

export type AppExtras = {
  readonly configure: (autoplay: AutoplayConfig | undefined) => void;
  readonly setRun: (run: { readonly left: number } | undefined) => void;
  readonly running: () => boolean;
  /** The configured interval, for a count the configuration offers only. */
  readonly interval: (count: number) => number | undefined;
  /** The session opened: its summary counts from now. */
  readonly opened: () => void;
  /** Keeps the summary's rounds, and leaves a run's last round (W-40). */
  readonly follow: (state: WrapperState) => WrapperState;
  /** The bar's autoplay view, when the configuration turns autoplay on. */
  readonly autoplay: () => AutoplayView | undefined;
  readonly summary: () => (() => SessionSummary) | undefined;
};

export const createAppExtras = (now: () => number): AppExtras => {
  let config: AutoplayConfig | undefined;
  let run: { readonly left: number } | undefined;
  let openedAt: number | undefined;
  const played = new Set<string>();
  return Object.freeze({
    configure: (autoplay: AutoplayConfig | undefined): void => {
      config = autoplay;
    },
    setRun: (next: { readonly left: number } | undefined): void => {
      run = next;
    },
    running: (): boolean => run !== undefined,
    interval: (count: number): number | undefined =>
      config?.counts.includes(count) === true
        ? config.minIntervalMs
        : undefined,
    opened: (): void => {
      openedAt = now();
    },
    follow: (state: WrapperState): WrapperState => {
      const shown = state.snapshot?.roundId;
      const last = state.endedRound?.roundId;
      const next =
        run !== undefined &&
        last !== undefined &&
        shown !== undefined &&
        shown !== last
          ? leaveEndedRound(state, last)
          : state;
      if (next.endedRound !== undefined) played.add(next.endedRound.roundId);
      return next;
    },
    autoplay: (): AutoplayView | undefined =>
      config === undefined
        ? undefined
        : { counts: config.counts, ...(run === undefined ? {} : { run }) },
    summary: (): (() => SessionSummary) | undefined => {
      const started = openedAt;
      return started === undefined
        ? undefined
        : () => ({
            minutes: Math.max(0, Math.floor((now() - started) / 60_000)),
            rounds: played.size,
          });
    },
  });
};
