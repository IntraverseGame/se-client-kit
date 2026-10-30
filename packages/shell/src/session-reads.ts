// The session's read side (W-25, W-28, W-35, W-42): what the UI and the game
// are shown of the Snapshots the session reads and of the round flow's
// answers, and whether the round the session holds is still open (the
// `round-exists` guard). While the round's required cancel holds the round
// (`in-flight`, `settling`, `check-later`; W-25), the round is open whatever
// the session saw, the UI gets the round's own latest Snapshot, never one
// from elsewhere (the game is sent nothing from such a read), and a read is
// the cancel's own (its counted read, or "check again"). The game is given
// only what W-38's hold allows (game-hold.ts). Every Snapshot passes the
// session's one-presentation guard first (W-53): one that changes the
// session is not read in, and from then on the session reads nothing more and
// answers `session-changed`. Every answer is a validated Snapshot, a validated
// typed error, or a closed code. It logs nothing.

import {
  NetworkError,
  ProblemError,
  ProtocolError,
} from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { type CancelState, holdsRound, isOfRound } from "./cancel-state.ts";
import type { ControllerBridge } from "./controller-bridge.ts";
import { ShellError } from "./errors.ts";
import { givenToGame } from "./game-hold.ts";
import {
  createPresentationGuard,
  type SessionChange,
} from "./session-presentation.ts";
import { roundStateOf, type SessionRound } from "./session-round.ts";
import type { RoundState, SessionRead } from "./session-types.ts";
import {
  type SnapshotRead,
  type SnapshotReader,
  snapshotReadOfError,
} from "./snapshot-read.ts";

export const ENDED: SessionRead = Object.freeze({ kind: "session-ended" });
/** A Snapshot changed the session (W-53): final until the page is reloaded. */
export const CHANGED: SessionRead = Object.freeze({ kind: "session-changed" });
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
  /** The round's stale read before the action: never this action's answer. */
  readonly stale: ValidSnapshot | undefined;
};

/** Before a round's first action: no failure, no cancel. */
export const FRESH: Before = Object.freeze({
  error: undefined,
  cancel: "none",
  stale: undefined,
});

export const beforeOf = (flow: SessionRound | undefined): Before =>
  flow === undefined
    ? FRESH
    : Object.freeze({
        error: flow.lastError(),
        cancel: flow.cancel(),
        stale: flow.staleRead(),
      });

/** Whether `flow`'s cancel moved, since `before`, to a state its reads decide. */
const cancelDecided = (flow: SessionRound, before: Before): boolean => {
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
  /** Called once, when a Snapshot changes the session (W-53). */
  readonly onChange: () => void;
  /** The round the session holds, if any. */
  readonly current: () => SessionRound | undefined;
  /** The game's bridge, once mounted. */
  readonly bridge: () => ControllerBridge | undefined;
  readonly ended: () => boolean;
};

export type SessionReads = {
  /**
   * Lets the current round's checks, and the game, see a validated Snapshot,
   * and resolves with the Snapshot the UI is given, or `undefined` when it
   * changed the session (W-53) and was not read in.
   */
  readonly see: (snapshot: ValidSnapshot) => Promise<ValidSnapshot | undefined>;
  /** An action's answer: its new failure, or the round's latest Snapshot. */
  readonly settle: (flow: SessionRound, before: Before) => SessionRead;
  /** The session's Snapshot read (`PlaySession.read`). */
  readonly read: () => Promise<SessionRead>;
  /** Whether the round the session holds is still open (`round-exists`). */
  readonly holdsOpenRound: () => boolean;
  /**
   * The session's W-53 guard: whether a Snapshot may be read in. The first one
   * it refuses changes the session, for good.
   */
  readonly admit: (snapshot: ValidSnapshot) => boolean;
  /** Whether a Snapshot changed the session (W-53). */
  readonly changed: () => boolean;
  /** The read-only state of the current round (`PlaySession.round`). */
  readonly round: () => RoundState | undefined;
  /** The game's copy at its mount, if W-38's hold gives it now. */
  readonly atMount: () => ValidSnapshot | undefined;
  /** What a changed session kept: the four fields' first and changed values. */
  readonly change: () => SessionChange | undefined;
};

export const createSessionReads = (host: SessionReadsHost): SessionReads => {
  const { reader, current, ended } = host;
  const guard = createPresentationGuard();
  const changed = (): boolean => guard.change() !== undefined;
  const admit = (snapshot: ValidSnapshot): boolean => {
    if (guard.admit(snapshot)) return true;
    if (guard.change() !== undefined) host.onChange();
    return false;
  };
  // The latest validated Snapshot the round guard saw, of any round.
  let shown: ValidSnapshot | undefined;

  // Shows a Snapshot to the round guard, and to the game unless W-38's hold
  // keeps it (the hand-off that made the round `ready` is the release).
  const show = (snapshot: ValidSnapshot): ValidSnapshot => {
    shown = snapshot;
    const bridge = host.bridge();
    if (bridge !== undefined && givenToGame(snapshot, current())) {
      bridge.sendSnapshot(snapshot);
    }
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
  const see = async (
    snapshot: ValidSnapshot,
  ): Promise<ValidSnapshot | undefined> => {
    // W-53 before the round's own rules (W-52, W-26).
    if (!admit(snapshot)) return undefined;
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

  const settle = (flow: SessionRound, before: Before): SessionRead => {
    if (ended()) return ENDED;
    if (changed()) return CHANGED;
    const error = flow.lastError();
    if (
      !cancelDecided(flow, before) &&
      error !== undefined &&
      error !== before.error
    ) {
      return readOfError(error);
    }
    // An answer that was a stale read of the round (W-29) is what the action
    // got: the UI drops it for its lower `version` and reads again (W-35), and
    // the game's bridge ignores it; the round did not read it in.
    // Only this action's own stale answer: one left from before it (an action
    // decided only through the cancel's reads observes nothing) is not.
    const stale = flow.staleRead();
    const answer =
      stale !== undefined && stale !== before.stale ? stale : flow.latest();
    return Object.freeze({ kind: "snapshot", snapshot: show(answer) });
  };

  // While the cancel is `settling`, a read is one of its counted reads
  // (`refresh`), and from `check-later` its "check again" read (`checkAgain`),
  // so it may settle the cancel (W-35): never `reader.read()` and `observe`,
  // whose Snapshot the cancel's gate drops. The flow's `checkAgain` is its
  // `refresh` today, so which one is called cannot be observed; the two names
  // follow W-35's two reads, and keep apart if the flow's ever differ.
  const readCancel = async (flow: SessionRound): Promise<SessionRead> => {
    const before = beforeOf(flow);
    await (flow.cancel() === "check-later"
      ? flow.checkAgain()
      : flow.refresh());
    return settle(flow, before);
  };

  const read = async (): Promise<SessionRead> => {
    if (ended()) return ENDED;
    // A changed session reads nothing more (W-53).
    if (changed()) return CHANGED;
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
    if (given === undefined) return CHANGED;
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

  const atMount = (): ValidSnapshot | undefined => {
    const flow = current();
    const latest = flow?.latest() ?? reader.latest();
    return latest !== undefined && givenToGame(latest, flow)
      ? latest
      : undefined;
  };

  return Object.freeze({
    see,
    settle,
    read,
    holdsOpenRound,
    admit,
    changed,
    round: (): RoundState | undefined => {
      const flow = current();
      return flow === undefined ? undefined : roundStateOf(flow);
    },
    atMount,
    change: guard.change,
  });
};
