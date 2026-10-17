// The open session's use cases (W-22 to W-26, W-37, W-42): read the Snapshot
// (validated, and seen by the current round's checks), start a round, cash
// out, the game's pick, and the game's mount, with the read-only state of the
// current round. One start or cash-out at a time: a second while one is in
// flight is refused `busy`, and a start while the held round is not over is
// refused `round-exists`; neither sends anything. Every answer is a validated
// Snapshot, a validated typed error, or a closed code; nothing here returns
// the key, the token, a signature, or the transcript. It logs nothing.

import {
  NetworkError,
  ProblemError,
  ProtocolError,
  type RandomUuid,
} from "@intraverse/se-client-play-client";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import {
  type ControllerBridge,
  createControllerBridge,
  type PickUseCase,
} from "./controller-bridge.ts";
import { ShellError } from "./errors.ts";
import { createPickUseCase } from "./pick-use-case.ts";
import { redacting } from "./redaction.ts";
import type { RoundFlow, RoundFlowOptions } from "./round-flow.ts";
import { type Bet, startRoundFlow } from "./round-start.ts";
import type {
  GameMount,
  GameMountOptions,
  PlaySession,
  RoundState,
  SessionRead,
} from "./session-types.ts";
import { createSnapshotReader, snapshotReadOfError } from "./snapshot-read.ts";

export type PlaySessionParts = {
  /** The round flows' options: the signing session, transport, token, checks. */
  readonly flow: RoundFlowOptions;
  readonly randomUuid: RandomUuid;
  readonly gameOrigin?: () => string | undefined;
  /** The configuration's allow-list of game origins, fixed at open (W-37). */
  readonly gameOrigins: readonly string[];
  /** The Wrapper's own origin, the SE origin, fixed at open. */
  readonly ownOrigin: string;
  readonly ended: () => boolean;
  readonly end: () => void;
};

export type PlaySessionHandle = {
  readonly session: PlaySession;
  /** Tells the session's listeners it ended, and closes the game's bridge. */
  readonly notifyEnd: () => void;
};

const ENDED: SessionRead = Object.freeze({ kind: "session-ended" });
const REJECTED: SessionRead = Object.freeze({ kind: "rejected" });

const refused = (
  reason: Extract<SessionRead, { readonly kind: "refused" }>["reason"],
): SessionRead => Object.freeze({ kind: "refused", reason });

/** A failure the round flow kept, as the UI's read (W-42, W-43). */
const readOfError = (error: Error): SessionRead => {
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

export const createPlaySession = (
  parts: PlaySessionParts,
): PlaySessionHandle => {
  const { flow: flowOptions, ended } = parts;
  const endListeners = new Set<() => void>();
  const changeListeners = new Set<(read: SessionRead) => void>();
  let current: RoundFlow | undefined;
  let bridge: ControllerBridge | undefined;
  // A start or a cash-out in flight: a second one is refused, never sent.
  let acting = false;
  // The latest validated Snapshot the session saw, of any round.
  let shown: ValidSnapshot | undefined;
  const gameOrigins: readonly string[] = Object.freeze([...parts.gameOrigins]);
  const { ownOrigin } = parts;

  const reader = createSnapshotReader({
    transport: flowOptions.transport,
    authorization: flowOptions.authorization,
  });

  /** Lets the current round's checks, and the game, see a validated Snapshot. */
  const see = async (snapshot: ValidSnapshot): Promise<void> => {
    shown = snapshot;
    if (current !== undefined && snapshot.roundId === current.roundId) {
      await current.observe(snapshot);
    }
    bridge?.sendSnapshot(snapshot);
  };

  const read = async (): Promise<SessionRead> => {
    if (ended()) return ENDED;
    const outcome = await reader.read();
    if (outcome.kind === "snapshot") await see(outcome.snapshot);
    if (outcome.kind === "problem" && outcome.problem.snapshot !== undefined) {
      await see(outcome.problem.snapshot);
    }
    return ended() ? ENDED : outcome;
  };

  /** An action's answer: its new failure, or the round's latest Snapshot. */
  const settle = (flow: RoundFlow, before: Error | undefined): SessionRead => {
    if (ended()) return ENDED;
    const error = flow.lastError();
    if (error !== undefined && error !== before) return readOfError(error);
    const snapshot = flow.latest();
    shown = snapshot;
    bridge?.sendSnapshot(snapshot);
    return Object.freeze({ kind: "snapshot", snapshot });
  };

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

  /**
   * Whether the round the shell holds is still open: its latest Snapshot is not
   * over, and the latest Snapshot the session saw is of that round (a read that
   * shows `idle` or another round lets a new round start).
   */
  const holdsOpenRound = (): boolean =>
    current !== undefined &&
    !current.over() &&
    shown?.roundId === current.roundId;

  const startOnce = async (bet: Bet): Promise<SessionRead> => {
    // A new round beside the open one the shell holds is never started.
    if (holdsOpenRound()) return refused("round-exists");
    try {
      const flow = await startRoundFlow({
        ...flowOptions,
        randomUuid: parts.randomUuid,
        bet,
      });
      current = flow;
      return settle(flow, undefined);
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
        await see(outcome.problem.snapshot);
      }
      return outcome;
    }
  };

  const start = (bet: Bet): Promise<SessionRead> =>
    ended() ? Promise.resolve(ENDED) : oneAtATime(() => startOnce(bet));

  const cashOutOnce = async (): Promise<SessionRead> => {
    const flow = current;
    if (flow === undefined) return refused("not_active");
    const before = flow.lastError();
    const outcome = await flow.cashOut();
    return outcome.accepted ? settle(flow, before) : refused(outcome.reason);
  };

  const cashOut = (): Promise<SessionRead> =>
    ended() ? Promise.resolve(ENDED) : oneAtATime(cashOutOnce);

  const flowPick = createPickUseCase(() => current);
  // The game's pick, through the round flow (the gate, W-23); its answer
  // reaches the UI through `onChange`.
  const pick: PickUseCase = async value => {
    const flow = current;
    const before = flow?.lastError();
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
    return Object.freeze({
      roundId: flow.roundId,
      verdict: verdict.state,
      ...(verdict.state === "failed" ? { shown: verdict.shown } : {}),
      outOfSync: flow.phase() === "out-of-sync",
      cashOutOffered: flow.cashOutOffered(),
    });
  };

  const gameOrigin = (): string | undefined => parts.gameOrigin?.();

  const mountGame = (mount: GameMountOptions): GameMount => {
    const origin = gameOrigin();
    if (origin === undefined || ended()) {
      return Object.freeze({ ok: false, refusal: "no-game-origin" });
    }
    const result = createControllerBridge({
      ...mount,
      gameOrigin: origin,
      gameOrigins,
      ownOrigin,
      pick,
    });
    if (!result.ok)
      return Object.freeze({ ok: false, refusal: result.refusal });
    bridge?.close();
    bridge = result.bridge;
    const latest = current?.latest() ?? reader.latest();
    if (latest !== undefined) bridge.sendSnapshot(latest);
    return Object.freeze({ ok: true, gameOrigin: origin });
  };

  const notifyEnd = (): void => {
    bridge?.close();
    bridge = undefined;
    for (const listener of endListeners) listener();
    endListeners.clear();
  };

  const session: PlaySession = redacting({
    read,
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
  return Object.freeze({ session, notifyEnd });
};
