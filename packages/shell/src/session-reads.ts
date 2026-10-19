// The session's read side (W-25, W-28, W-35, W-42): what the UI and the game
// are shown of the Snapshots the session reads and of the round flow's
// answers, and whether the round the session holds is still open (the
// `round-exists` guard). While the round's required cancel holds the round
// (`in-flight`, `settling`, `check-later`; W-25), the round is open whatever
// the session saw, the UI gets the round's own latest Snapshot, never one
// from elsewhere (the game is sent nothing from such a read), and a read is
// the cancel's own (its counted read, or "check again"). Every answer is a validated Snapshot, a validated typed
// error, or a closed code. It logs nothing.

import {
  NetworkError,
  ProblemError,
  ProtocolError,
} from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { type CancelState, holdsRound, isOfRound } from "./cancel-state.ts";
import type { ControllerBridge } from "./controller-bridge.ts";
import { ShellError } from "./errors.ts";
import type { RoundFlow } from "./round-flow.ts";
import type { SessionRead } from "./session-types.ts";
import {
  type SnapshotRead,
  type SnapshotReader,
  snapshotReadOfError,
} from "./snapshot-read.ts";

export const ENDED: SessionRead = Object.freeze({ kind: "session-ended" });
const REJECTED: SessionRead = Object.freeze({ kind: "rejected" });

export const refused = (
  reason: Extract<SessionRead, { readonly kind: "refused" }>["reason"],
): SessionRead => Object.freeze({ kind: "refused", reason });

/** A failure the round flow kept, as the UI's read (W-42, W-43). */
export const readOfError = (error: Error): SessionRead => {
  if (error instanceof ShellError) {
    return error.code === "snapshot-rejected" ? REJECTED : refused(error.code);
  }
  if (
    error instanceof NetworkError ||
    error instanceof ProblemError ||
    error instanceof ProtocolError
  ) {
    return snapshotReadOfError(error);
  }
  return REJECTED;
};

/**
 * The cancel states only the cancel's own answer and reads lead to (W-25): once
 * an action moved the cancel to one of them, the action's answer is the round's
 * Snapshot, not a failure of the cancel's call or of a read on the way (that
 * stays the flow's `lastError`, which is never cleared).
 */
const READ_DECIDED: ReadonlySet<CancelState> = new Set([
  "settling",
  "check-later",
  "sent",
  "not-taken",
  "ended",
]);

/** What a round flow showed before an action: its last failure and cancel. */
export type Before = {
  readonly error: Error | undefined;
  readonly cancel: CancelState;
};

/** Before a round's first action: no failure, no cancel. */
export const FRESH: Before = Object.freeze({
  error: undefined,
  cancel: "none",
});

export const beforeOf = (flow: RoundFlow | undefined): Before =>
  flow === undefined
    ? FRESH
    : Object.freeze({ error: flow.lastError(), cancel: flow.cancel() });

/** Whether `flow`'s cancel moved, since `before`, to a state its reads decide. */
const cancelDecided = (flow: RoundFlow, before: Before): boolean => {
  const cancel = flow.cancel();
  return cancel !== before.cancel && READ_DECIDED.has(cancel);
};

/** The validated Snapshot a read carries: its own, or a problem's embedded one. */
const snapshotOfRead = (read: SnapshotRead): ValidSnapshot | undefined => {
  if (read.kind === "snapshot") return read.snapshot;
  return read.kind === "problem" ? read.problem.snapshot : undefined;
};

export type SessionReadsHost = {
  readonly reader: SnapshotReader;
  /** The round the session holds, if any. */
  readonly current: () => RoundFlow | undefined;
  /** The game's bridge, once mounted. */
  readonly bridge: () => ControllerBridge | undefined;
  readonly ended: () => boolean;
};

export type SessionReads = {
  /**
   * Lets the current round's checks, and the game, see a validated Snapshot,
   * and resolves with the Snapshot the UI is given.
   */
  readonly see: (snapshot: ValidSnapshot) => Promise<ValidSnapshot>;
  /** An action's answer: its new failure, or the round's latest Snapshot. */
  readonly settle: (flow: RoundFlow, before: Before) => SessionRead;
  /** The session's Snapshot read (`PlaySession.read`). */
  readonly read: () => Promise<SessionRead>;
  /** Whether the round the session holds is still open (`round-exists`). */
  readonly holdsOpenRound: () => boolean;
};

export const createSessionReads = (host: SessionReadsHost): SessionReads => {
  const { reader, current, ended } = host;
  // The latest validated Snapshot the round guard saw, of any round.
  let shown: ValidSnapshot | undefined;

  /** Shows a Snapshot to the round guard and to the game. */
  const show = (snapshot: ValidSnapshot): ValidSnapshot => {
    shown = snapshot;
    host.bridge()?.sendSnapshot(snapshot);
    return snapshot;
  };

  // While the round's cancel holds the round (W-25), a Snapshot read from
  // elsewhere (of the round, `idle`, or another round) is neither shown nor
  // sent to the game: the UI gets the round's own latest Snapshot, the game
  // nothing (it gets the round from the cancel's own answer or read), and the
  // round guard keeps what it saw. Once this read moved the cancel to a state
  // its own reads decide, the round's latest Snapshot is shown. Otherwise,
  // when observing the read led to a newer Snapshot of the round (by
  // `version`: the answer to the W-16 resend the read caused), the UI and the
  // game are shown that one, never the read's older one.
  const see = async (snapshot: ValidSnapshot): Promise<ValidSnapshot> => {
    const flow = current();
    const before = beforeOf(flow);
    if (flow !== undefined && snapshot.roundId === flow.roundId) {
      await flow.observe(snapshot);
    }
    // The session's round now: a start may have made another one current while
    // this read was observed, and its hold decides.
    const now = current();
    if (now === undefined) return show(snapshot);
    if (holdsRound(now.cancel())) return now.latest();
    if (now === flow && cancelDecided(now, before)) return show(now.latest());
    if (
      now === flow &&
      isOfRound(snapshot, now.roundId) &&
      now.latest().version > snapshot.version
    ) {
      return show(now.latest());
    }
    return show(snapshot);
  };

  const settle = (flow: RoundFlow, before: Before): SessionRead => {
    if (ended()) return ENDED;
    const error = flow.lastError();
    if (
      !cancelDecided(flow, before) &&
      error !== undefined &&
      error !== before.error
    ) {
      return readOfError(error);
    }
    return Object.freeze({ kind: "snapshot", snapshot: show(flow.latest()) });
  };

  // While the cancel is `settling`, a read is one of its counted reads
  // (`refresh`), and from `check-later` its "check again" read (`checkAgain`),
  // so it may settle the cancel (W-35): never `reader.read()` and `observe`,
  // whose Snapshot the cancel's gate drops. The flow's `checkAgain` is its
  // `refresh` today, so which one is called cannot be observed; the two names
  // follow W-35's two reads, and keep apart if the flow's ever differ.
  const readCancel = async (flow: RoundFlow): Promise<SessionRead> => {
    const before = beforeOf(flow);
    await (flow.cancel() === "check-later"
      ? flow.checkAgain()
      : flow.refresh());
    return settle(flow, before);
  };

  const read = async (): Promise<SessionRead> => {
    if (ended()) return ENDED;
    const flow = current();
    const cancel = flow?.cancel();
    if (
      flow !== undefined &&
      (cancel === "settling" || cancel === "check-later")
    ) {
      return readCancel(flow);
    }
    const outcome = await reader.read();
    const seen = snapshotOfRead(outcome);
    if (seen === undefined) return ended() ? ENDED : outcome;
    const given = await see(seen);
    if (ended()) return ENDED;
    return given === seen
      ? outcome
      : Object.freeze({ kind: "snapshot", snapshot: given });
  };

  // Open while its cancel holds it (whatever the guard saw, W-25), or while it
  // is not over (`ended` is) and the latest Snapshot the guard saw is of that
  // round (a read that shows `idle` or another round lets a new round start).
  const holdsOpenRound = (): boolean => {
    const flow = current();
    if (flow === undefined) return false;
    if (holdsRound(flow.cancel())) return true;
    return !flow.over() && shown?.roundId === flow.roundId;
  };

  return Object.freeze({ see, settle, read, holdsOpenRound });
};
