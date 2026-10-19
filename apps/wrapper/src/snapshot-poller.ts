// W-35: while the round is polled (`pollModeOf`: `starting` or `resolving`
// today, never a round that is over by the shell's `isRoundOver`, and while the
// shell's cancel is `settling`, whatever the status), the Snapshot is read
// again with bounded backoff until the status changes; after a longer wait the
// reads go on at the slow rate with a "taking longer than expected" notice.
// While the cancel is `check-later`, or an `active` round's move or cash-out is
// not confirmed (W-16), the fast poll stops (or never starts) and one
// background read runs every 30 s, with no notice. W-43: a read that gets no
// response is repeated at the slow rate (in the background, at its own rate).
// Polling stops when the round is not polled (a terminal status, or the cancel
// `ended`, `not-taken`, or `sent`) or when the session ended. One read is in
// flight at a time; time comes from the injected timers only.

import {
  type CancelState,
  type PollMode,
  pollModeOf,
  type RoundProgress,
  type RoundStatus,
  type SnapshotRead,
} from "./round-input.ts";
import type { TimerHandle, Timers } from "./timers.ts";

export type PollConfig = {
  /** The first wait, doubling after each read up to `slowDelayMs`. */
  readonly initialDelayMs: number;
  /** The slow rate: the longest wait between two reads. */
  readonly slowDelayMs: number;
  /** After this long in one status, the "taking longer" notice shows. */
  readonly slowNoticeAfterMs: number;
  /** The wait between two background reads while the cancel is `check-later`. */
  readonly checkLaterDelayMs: number;
};

/**
 * W-35's defaults: 500 ms rising to 2 s, and a background read every 30 s in
 * `check-later` (Wrapper configuration). PROVISIONAL: `slowNoticeAfterMs`; W-35
 * says "after a longer wait" without a number, so 15 s (W-43's request timeout)
 * holds until the spec gives one.
 */
export const DEFAULT_POLL_CONFIG: PollConfig = Object.freeze({
  initialDelayMs: 500,
  slowDelayMs: 2_000,
  slowNoticeAfterMs: 15_000,
  checkLaterDelayMs: 30_000,
});

export type SnapshotPoller = {
  /**
   * Follows the last accepted Snapshot, the shell's cancel state of its round,
   * and whether its move or cash-out is not confirmed (W-16): polls while it is
   * polled (`pollModeOf`), restarts the backoff when the status or the mode
   * changes, and stops in any other (or when `undefined`: the session ended or
   * a state blocks).
   */
  readonly follow: (
    round: RoundProgress | undefined,
    cancel?: CancelState,
    unconfirmed?: boolean,
  ) => void;
  /** Reads now instead of at the next tick (the connection came back). */
  readonly pollNow: () => void;
  readonly stop: () => void;
  readonly running: () => boolean;
};

export type SnapshotPollerOptions = {
  /** One Snapshot read; validated by the session before it resolves. */
  readonly read: () => Promise<SnapshotRead>;
  readonly timers: Timers;
  readonly onRead: (read: SnapshotRead) => void;
  readonly onSlow: () => void;
  readonly config?: PollConfig;
};

type Phase = {
  readonly status: RoundStatus;
  readonly mode: PollMode;
  readonly startedAt: number;
  reads: number;
  slowNotified: boolean;
};

export const createSnapshotPoller = (
  options: SnapshotPollerOptions,
): SnapshotPoller => {
  const config = options.config ?? DEFAULT_POLL_CONFIG;
  const { timers } = options;
  let phase: Phase | undefined;
  let timer: TimerHandle | undefined;
  let inFlight = false;
  let generation = 0;

  const clear = (): void => {
    if (timer !== undefined) {
      timers.clearTimeout(timer);
      timer = undefined;
    }
  };

  const backoff = (reads: number): number =>
    Math.min(config.slowDelayMs, config.initialDelayMs * 2 ** reads);

  const readOnce = async (): Promise<SnapshotRead> => {
    try {
      return await options.read();
    } catch {
      // A read port that throws reports no usable response.
      return { kind: "network" };
    }
  };

  const tick = async (): Promise<void> => {
    timer = undefined;
    if (phase === undefined || inFlight) {
      return;
    }
    inFlight = true;
    const current = generation;
    const result = await readOnce();
    inFlight = false;
    if (current !== generation) {
      // Stopped while the read was in flight: its result is not used.
      return;
    }
    options.onRead(result);
    // `onRead` may have stopped polling or restarted it in a new status.
    if (phase === undefined || timer !== undefined || current !== generation) {
      return;
    }
    if (phase.mode === "background") {
      // `check-later`: no backoff and no notice, one read per interval.
      schedule(config.checkLaterDelayMs);
      return;
    }
    phase.reads += 1;
    if (
      !phase.slowNotified &&
      timers.now() - phase.startedAt >= config.slowNoticeAfterMs
    ) {
      phase.slowNotified = true;
      options.onSlow();
    }
    schedule(
      result.kind === "network" || phase.slowNotified
        ? config.slowDelayMs
        : backoff(phase.reads),
    );
  };

  const schedule = (ms: number): void => {
    clear();
    timer = timers.setTimeout(() => {
      void tick();
    }, ms);
  };

  const stop = (): void => {
    clear();
    phase = undefined;
    generation += 1;
  };

  return Object.freeze({
    follow: (
      round: RoundProgress | undefined,
      cancel?: CancelState,
      unconfirmed = false,
    ): void => {
      const mode =
        round === undefined
          ? undefined
          : pollModeOf(round, cancel, unconfirmed);
      if (round === undefined || mode === undefined) {
        stop();
        return;
      }
      const { status } = round;
      if (phase?.status === status && phase.mode === mode) {
        return;
      }
      phase = {
        status,
        mode,
        startedAt: timers.now(),
        reads: 0,
        slowNotified: false,
      };
      if (!inFlight) {
        schedule(mode === "background" ? config.checkLaterDelayMs : backoff(0));
      }
    },
    pollNow: (): void => {
      if (phase !== undefined && !inFlight) {
        schedule(0);
      }
    },
    stop,
    running: (): boolean => phase !== undefined,
  });
};
