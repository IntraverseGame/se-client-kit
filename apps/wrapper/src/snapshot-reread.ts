// W-29, W-35: after the Wrapper drops a Snapshot because its `version` is lower
// than the one shown (a later read can carry a lower one), the Snapshot is read
// again where no poll would read it: up to `FAST_REREADS` reads at W-35's
// backoff (500 ms, 1 s, 2 s, 2 s), then one read every 30 s, the background
// rate, until a read is taken. An equal `version` never starts it. It stops
// on the first read that is not dropped for a lower `version` (taken, equal, a
// typed error, a rejected answer, the session's end), and whenever the host
// says no re-read may run (a poll runs, a typed error or a blocking state
// shows, the shell's cancel reads the round itself; the host calls `stop` the
// moment that turns true, so no timer is left). A read with no response
// waits the slow rate (W-43). It only reads: it never sends or signs, and it
// shows no notice. Time comes from the injected timers only.

import type { SnapshotRead } from "./round-input.ts";
import { DEFAULT_POLL_CONFIG, type PollConfig } from "./snapshot-poller.ts";
import type { TimerHandle, Timers } from "./timers.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

/**
 * Whether `read` is a Snapshot W-29 drops because its `version` is lower than
 * the one `state` shows (an equal one carries nothing new and is not a drop to
 * recover from). A final state takes nothing, so nothing is dropped there.
 */
export const droppedLower = (
  state: WrapperState,
  read: SnapshotRead,
): boolean =>
  read.kind === "snapshot" &&
  !isFinal(state) &&
  state.snapshot !== undefined &&
  read.snapshot.version < state.snapshot.version;

/** The fast re-reads before the background rate (W-35's backoff). */
export const FAST_REREADS = 4;

export type SnapshotRereadOptions = {
  /** One Snapshot read, the session's own. */
  readonly read: () => Promise<SnapshotRead>;
  readonly timers: Timers;
  /**
   * Applies a re-read's outcome, as a poll's (cause `"poll"`); answers whether
   * its Snapshot was dropped for a lower `version` again.
   */
  readonly onRead: (read: SnapshotRead) => boolean;
  /** Whether a re-read may run now (no poll, no typed error, no block). */
  readonly mayRead: () => boolean;
  readonly config?: PollConfig;
};

export type SnapshotReread = {
  /** A Snapshot was dropped for a lower `version`: read again, if allowed. */
  readonly dropped: () => void;
  readonly stop: () => void;
  /** Whether re-reads are scheduled or in flight. */
  readonly running: () => boolean;
};

export const createSnapshotReread = (
  options: SnapshotRereadOptions,
): SnapshotReread => {
  const config = options.config ?? DEFAULT_POLL_CONFIG;
  const { timers } = options;
  let timer: TimerHandle | undefined;
  let active = false;
  let inFlight = false;
  let reads = 0;
  let generation = 0;

  const stop = (): void => {
    generation += 1;
    active = false;
    inFlight = false;
    reads = 0;
    if (timer !== undefined) {
      timers.clearTimeout(timer);
      timer = undefined;
    }
  };

  const delayAfter = (read?: SnapshotRead): number => {
    if (reads >= FAST_REREADS) return config.checkLaterDelayMs;
    if (read?.kind === "network") return config.slowDelayMs;
    return Math.min(config.slowDelayMs, config.initialDelayMs * 2 ** reads);
  };

  const schedule = (read?: SnapshotRead): void => {
    timer = timers.setTimeout(() => {
      void tick();
    }, delayAfter(read));
  };

  const tick = async (): Promise<void> => {
    timer = undefined;
    if (!options.mayRead()) {
      stop();
      return;
    }
    const current = generation;
    inFlight = true;
    let read: SnapshotRead;
    try {
      read = await options.read();
    } catch {
      read = { kind: "network" };
    }
    if (current !== generation) return;
    inFlight = false;
    reads += 1;
    const again = options.onRead(read);
    // `onRead` may have dropped it once more, or let a stop rule apply.
    if (current !== generation) return;
    if (!(again || read.kind === "network") || !options.mayRead()) {
      stop();
      return;
    }
    schedule(read);
  };

  return Object.freeze({
    dropped: (): void => {
      if (active || !options.mayRead()) return;
      active = true;
      reads = 0;
      schedule();
    },
    stop,
    running: (): boolean => active || inFlight,
  });
};
