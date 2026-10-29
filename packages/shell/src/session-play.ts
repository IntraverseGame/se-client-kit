// The open session's use cases (W-22 to W-26, W-37, W-42): read the Snapshot
// (validated, and seen by the current round's checks), start a round, cash
// out, the game's pick, and the game's mount, with the read-only state of the
// current round. One start or cash-out at a time: a second while one is in
// flight is refused `busy`, and a start while the held round is not over is
// refused `round-exists`; neither sends anything. While the round's required
// cancel holds the round (`in-flight`, `settling`, `check-later`; W-25), the
// round is open and the session's reads are the cancel's own (W-35;
// session-reads.ts). A book round (`playback`, W-50 to W-52) starts the same
// way and is then only read: nothing is signed for it (book-round.ts). Every
// Snapshot passes the session's one-presentation guard first (W-53,
// session-presentation.ts): one that changes the session is not read in, the
// game's bridge is closed, and from then until the page is reloaded every use
// case answers `session-changed` with nothing read, signed, started, or
// forwarded. Every answer is a validated Snapshot, a validated typed error, or
// a closed code; nothing here returns the key, the token, a signature, or the
// transcript. It logs nothing.

import type { RandomUuid } from "@intraverse/se-client-play-client";

import type { Environment } from "./chain-config.ts";
import {
  type ControllerBridge,
  createControllerBridge,
  type PickUseCase,
} from "./controller-bridge.ts";
import { createPickUseCase } from "./pick-use-case.ts";
import { redacting } from "./redaction.ts";
import type { RoundFlowOptions } from "./round-flow.ts";
import { type Bet, startSessionRound } from "./round-start.ts";
import {
  beforeOf,
  CHANGED,
  createSessionReads,
  ENDED,
  FRESH,
  readOfError,
  refused,
  type SessionReads,
  type SessionReadsHost,
} from "./session-reads.ts";
import type {
  GameMount,
  GameMountOptions,
  PlaySession,
  RoundState,
  SessionRead,
} from "./session-types.ts";
import { createSnapshotReader } from "./snapshot-read.ts";

export type PlaySessionParts = {
  /** The round flows' options: the signing session, transport, token, checks. */
  readonly flow: RoundFlowOptions;
  readonly randomUuid: RandomUuid;
  /** D, the redeem answer's `gameOrigin`, fixed at open (W-37). */
  readonly gameOrigin: string;
  /**
   * The path of the game's page on D, the redeem answer's `gamePath` (`/` when
   * it has none), fixed at open (W-37). Not a trust boundary: messages are
   * matched by D only.
   */
  readonly gamePath: string;
  /** The configuration's allow-list of game origins, fixed at open (W-37). */
  readonly gameOrigins: readonly string[];
  /** The Wrapper's own origin, the SE origin, fixed at open. */
  readonly ownOrigin: string;
  /** The configuration's `environment`, for W-37's loopback exemption. */
  readonly environment: Environment;
  readonly ended: () => boolean;
  readonly end: () => void;
};

export type PlaySessionHandle = {
  readonly session: PlaySession;
  /** Tells the session's listeners it ended, and closes the game's bridge. */
  readonly notifyEnd: () => void;
  /**
   * What a changed session kept (W-53, W-27): the first and the differing
   * values of the four fields, and nothing else. Internal: the shell's own
   * evidence, never handed to the UI.
   */
  readonly change: SessionReads["change"];
};

export const createPlaySession = (
  parts: PlaySessionParts,
): PlaySessionHandle => {
  const { flow: flowOptions, ended } = parts;
  const endListeners = new Set<() => void>();
  const changeListeners = new Set<(read: SessionRead) => void>();
  // The round the session holds: a config round's flow or a book round.
  let current: ReturnType<SessionReadsHost["current"]>;
  let bridge: ControllerBridge | undefined;
  // A start or a cash-out in flight: a second one is refused, never sent.
  let acting = false;
  const gameOrigins: readonly string[] = Object.freeze([...parts.gameOrigins]);
  const { ownOrigin, environment } = parts;

  const reader = createSnapshotReader({
    transport: flowOptions.transport,
    authorization: flowOptions.authorization,
  });
  const reads = createSessionReads({
    reader,
    current: () => current,
    bridge: () => bridge,
    ended,
    // The Snapshot that changes the session closes the game's bridge: nothing
    // more is forwarded to the game (W-53).
    onChange: () => {
      bridge?.close();
      bridge = undefined;
    },
  });
  const { see, settle, read, holdsOpenRound, admit, changed } = reads;

  /**
   * Runs one start or cash-out at a time: while one is in flight, another is
   * refused `busy` and nothing is signed or sent.
   */
  const oneAtATime = async (
    action: () => Promise<SessionRead>,
  ): Promise<SessionRead> => {
    if (acting) return refused("busy");
    acting = true;
    try {
      return await action();
    } finally {
      acting = false;
    }
  };

  const startOnce = async (bet: Bet): Promise<SessionRead> => {
    // A new round beside the open one the shell holds is never started.
    if (holdsOpenRound()) return refused("round-exists");
    try {
      const flow = await startSessionRound({
        ...flowOptions,
        admit,
        randomUuid: parts.randomUuid,
        bet,
        // The round is the session's before its first Snapshot is read, so a
        // read during the cancel that Snapshot requires is held (W-25).
        onFlow: started => {
          current = started;
        },
      });
      // The start's answer changed the session (W-53): it is not read in.
      if (flow === undefined) return ended() ? ENDED : CHANGED;
      // A cancel the round's first Snapshot required is part of the start: once
      // its reads decide it, the start answers with the round (W-25).
      return settle(flow, FRESH);
    } catch (error) {
      if (ended()) return ENDED;
      if (!(error instanceof Error)) throw error;
      const outcome = readOfError(error);
      if (
        outcome.kind === "problem" &&
        outcome.problem.snapshot !== undefined
      ) {
        // `ROUND_ACTIVE`: the open round is shown; the shell holds no state
        // for it, so it signs nothing in it (W-42).
        const seen = await see(outcome.problem.snapshot);
        if (seen === undefined) return CHANGED;
      }
      return outcome;
    }
  };

  /** The answer of a use case that may not run: the session ended or changed. */
  const closed = (): SessionRead | undefined => {
    if (ended()) return ENDED;
    return changed() ? CHANGED : undefined;
  };

  const start = (bet: Bet): Promise<SessionRead> => {
    const answer = closed();
    return answer === undefined
      ? oneAtATime(() => startOnce(bet))
      : Promise.resolve(answer);
  };

  const cashOutOnce = async (): Promise<SessionRead> => {
    const flow = current;
    if (flow === undefined) return refused("not_active");
    const before = beforeOf(flow);
    const outcome = await flow.cashOut();
    return outcome.accepted ? settle(flow, before) : refused(outcome.reason);
  };

  const cashOut = (): Promise<SessionRead> => {
    const answer = closed();
    return answer === undefined
      ? oneAtATime(cashOutOnce)
      : Promise.resolve(answer);
  };

  // A changed session takes no pick (W-53): its bridge is closed anyway.
  const flowPick = createPickUseCase(() => (changed() ? undefined : current));
  // The game's pick, through the round flow (the gate, W-23); its answer
  // reaches the UI through `onChange`.
  const pick: PickUseCase = async value => {
    const flow = current;
    const before = beforeOf(flow);
    const outcome = await flowPick(value);
    if (outcome.accepted && flow !== undefined) {
      const answer = settle(flow, before);
      for (const listener of changeListeners) listener(answer);
    }
    return outcome;
  };

  const round = (): RoundState | undefined => {
    const flow = current;
    if (flow === undefined) return undefined;
    const verdict = flow.verdict();
    const unconfirmed = flow.unconfirmed();
    return Object.freeze({
      roundId: flow.roundId,
      verdict: verdict.state,
      ...(verdict.state === "failed" ? { shown: verdict.shown } : {}),
      outOfSync: flow.phase() === "out-of-sync",
      cashOutOffered: flow.cashOutOffered(),
      cancel: flow.cancel(),
      ...(unconfirmed === undefined ? {} : { unconfirmed }),
    });
  };

  const gameOrigin = (): string => parts.gameOrigin;

  const mountGame = (mount: GameMountOptions): GameMount => {
    const origin = gameOrigin();
    if (ended()) {
      return Object.freeze({ ok: false, refusal: "session-ended" });
    }
    const result = createControllerBridge({
      ...mount,
      gameOrigin: origin,
      gameOrigins,
      ownOrigin,
      environment,
      pick,
    });
    if (!result.ok)
      return Object.freeze({ ok: false, refusal: result.refusal });
    bridge?.close();
    const mounted: GameMount = Object.freeze({
      ok: true,
      gameOrigin: origin,
      gamePath: parts.gamePath,
    });
    if (changed()) {
      // A changed session forwards nothing to the game (W-53).
      result.bridge.close();
      bridge = undefined;
      return mounted;
    }
    bridge = result.bridge;
    const latest = current?.latest() ?? reader.latest();
    if (latest !== undefined) bridge.sendSnapshot(latest);
    return mounted;
  };

  const notifyEnd = (): void => {
    bridge?.close();
    bridge = undefined;
    for (const listener of endListeners) listener();
    endListeners.clear();
  };

  const session: PlaySession = redacting({
    read,
    // From `check-later`, `read` is the cancel's "check again" read (W-35).
    checkAgain: read,
    start,
    cashOut,
    round,
    gameOrigin,
    mountGame,
    onChange: (listener: (outcome: SessionRead) => void): (() => void) => {
      changeListeners.add(listener);
      return (): void => {
        changeListeners.delete(listener);
      };
    },
    onEnd: (listener: () => void): (() => void) => {
      if (ended()) {
        listener();
        return (): void => {};
      }
      endListeners.add(listener);
      return (): void => {
        endListeners.delete(listener);
      };
    },
    ended,
    end: parts.end,
  });
  return Object.freeze({ session, notifyEnd, change: reads.change });
};
