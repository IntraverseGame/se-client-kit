// Autoplay (RFC-005 section 6, W-61): a run of book-round starts the player
// asked for once, with its stop rules, kept in the shell so no money logic sits
// outside it (RFC-005 Q10). Each start is W-22's start, unchanged (a fresh
// `idempotencyKey`, the signer lock, the single resend), through the session's
// own start use case; a book round takes no input after it (W-50) and has
// nothing signed (W-51). The bet is the player's, fixed for the run, and each
// start copies its `AmountRequest` from the latest Snapshot's own `Amount` of
// that option (W-22, W-31). The next start goes only after the previous
// round's result was seen at least `minIntervalMs` before, and only while no
// stop rule holds. Every comparison of amounts is a `bigint` comparison in
// base units (W-34). The run lives in memory: nothing is stored, logged, or
// sent but the starts, and a reload never resumes it.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { covers, offeredAmount } from "./autoplay-bet.ts";
import {
  AUTOPLAY_MAX_COUNT,
  AUTOPLAY_MAX_INTERVAL_MS,
  type AutoplayBegin,
  type AutoplayRefusal,
  type AutoplayRequest,
  type AutoplayState,
  type AutoplayStop,
} from "./autoplay-types.ts";
import type { Bet } from "./round-start.ts";
import type { RoundFailure, SessionRead } from "./session-types.ts";
import { isRoundOver } from "./snapshot-reading.ts";

/** The parts of the session the run uses. */
export type AutoplayPorts = {
  /** The session's latest accepted Snapshot. */
  readonly latest: () => ValidSnapshot | undefined;
  /** The session's start use case (W-22). */
  readonly start: (bet: Bet) => Promise<SessionRead>;
  /** The current round's failure, if it failed (`changed`: W-52). */
  readonly failure: () => RoundFailure | undefined;
  /** The session ended or changed. */
  readonly closed: () => boolean;
  /** Hands a start's answer to the UI. */
  readonly answer: (read: SessionRead) => void;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

export type AutoplayRun = {
  readonly begin: (request: AutoplayRequest) => AutoplayBegin;
  /** A stop only the page can see: the player's, or the page hidden. */
  readonly stop: (reason: AutoplayStop) => void;
  /** Every answer the session gives, so the run sees each read. */
  readonly see: (read: SessionRead) => void;
  readonly state: () => AutoplayState;
  readonly running: () => boolean;
  readonly onState: (listener: (state: AutoplayState) => void) => () => void;
};

const isWhole = (value: number, low: number, high: number): boolean =>
  Number.isSafeInteger(value) && value >= low && value <= high;

/** The stop rule a read holds, if any (RFC-005 section 6). */
const stopOfRead = (read: SessionRead): AutoplayStop | undefined => {
  switch (read.kind) {
    case "session-ended": {
      return "session-ended";
    }
    case "session-changed": {
      return "session-changed";
    }
    case "refused": {
      return read.reason === "lock-not-held" ? "lock-lost" : "error";
    }
    case "problem": {
      return "error";
    }
    case "network": {
      return "connection";
    }
    case "rejected": {
      return "rejected";
    }
    default: {
      return undefined;
    }
  }
};

const refuse = (refusal: AutoplayRefusal): AutoplayBegin =>
  Object.freeze({ ok: false, refusal });

const IDLE: AutoplayState = Object.freeze({ kind: "idle" });

/** The run of one session; at most one goes at a time. */
export const createAutoplayRun = (ports: AutoplayPorts): AutoplayRun => {
  const listeners = new Set<(state: AutoplayState) => void>();
  let state: AutoplayState = IDLE;
  let request: AutoplayRequest | undefined;
  let started = 0;
  // The round the run's last start opened, and whether its result came.
  let awaited: string | undefined;
  let inFlight = false;
  let timer: unknown;

  const publish = (next: AutoplayState): void => {
    state = Object.freeze(next);
    for (const listener of listeners) listener(state);
  };

  const running = (): boolean => state.kind === "running";

  const stop = (reason: AutoplayStop): void => {
    if (!running()) return;
    if (timer !== undefined) {
      ports.clearTimeout(timer);
      timer = undefined;
    }
    awaited = undefined;
    publish({ kind: "stopped", reason, started });
  };

  const next = (): void => {
    timer = undefined;
    if (!running() || request === undefined) return;
    if (ports.closed()) {
      stop("session-ended");
      return;
    }
    if (state.kind === "running" && state.left === 0) {
      stop("count");
      return;
    }
    const latest = ports.latest();
    const amount =
      latest === undefined ? undefined : offeredAmount(latest, request.bet);
    if (latest === undefined || amount === undefined) {
      stop("bet-not-offered");
      return;
    }
    if (!covers(latest, amount)) {
      stop("balance");
      return;
    }
    started += 1;
    inFlight = true;
    awaited = undefined;
    publish({
      kind: "running",
      count: request.count,
      left: request.count - started,
    });
    // Each start copies its bet from the latest Snapshot's own `Amount`.
    const bet: Bet = {
      value: amount.value,
      unit: amount.unit,
      decimals: amount.decimals,
    };
    void ports.start(bet).then(
      answer => {
        // Only the start's own answer names the round the run waits on: a
        // read that landed while it was in flight (the previous round's
        // result, say) never does (W-61).
        inFlight = false;
        if (
          answer.kind === "snapshot" &&
          answer.snapshot.roundId !== undefined
        ) {
          awaited = answer.snapshot.roundId;
        }
        see(answer);
        ports.answer(answer);
        return null;
      },
      () => {
        inFlight = false;
        stop("error");
        // The generic error: the start failed with no answer to show.
        ports.answer(
          Object.freeze({ kind: "refused", reason: "use-case-failed" }),
        );
        return null;
      },
    );
  };

  /** The run's round reached its result: the next start waits the interval. */
  const resulted = (): void => {
    // One timer at a time: a second read of the result arms nothing more.
    if (timer !== undefined) return;
    if (request === undefined || state.kind !== "running") return;
    awaited = undefined;
    if (state.left === 0) {
      stop("count");
      return;
    }
    timer = ports.setTimeout(next, request.minIntervalMs);
  };

  const seeSnapshot = (snapshot: ValidSnapshot): void => {
    // While a start is in flight, its own answer decides (above): a read that
    // lands meanwhile is of an earlier round, or of this one before the
    // answer, and arms nothing.
    if (inFlight || awaited === undefined) return;
    if (snapshot.roundId !== awaited) {
      // The round went back to `idle` with no result: a void (W-54).
      if (snapshot.status === "idle") stop("round-ended");
      return;
    }
    // A changed round (W-52) stops the run, often on its result's own read.
    if (ports.failure() === "changed") {
      stop("changed-round");
      return;
    }
    if (snapshot.status === "won" || snapshot.status === "lost") {
      resulted();
    } else if (isRoundOver(snapshot)) {
      stop("round-ended");
    }
  };

  const see = (read: SessionRead): void => {
    if (!running()) return;
    const reason = stopOfRead(read);
    if (reason !== undefined) {
      stop(reason);
      return;
    }
    if (read.kind === "snapshot") seeSnapshot(read.snapshot);
  };

  const begin = (wanted: AutoplayRequest): AutoplayBegin => {
    if (
      !isWhole(wanted.count, 1, AUTOPLAY_MAX_COUNT) ||
      !isWhole(wanted.minIntervalMs, 0, AUTOPLAY_MAX_INTERVAL_MS)
    ) {
      return refuse("invalid-request");
    }
    if (ports.closed()) return refuse("closed");
    if (running()) return refuse("busy");
    const latest = ports.latest();
    if (latest === undefined || latest.presentation !== "playback") {
      return refuse("not-book");
    }
    if (latest.status !== "idle" && !isRoundOver(latest)) {
      return refuse("busy");
    }
    const amount = offeredAmount(latest, wanted.bet);
    if (amount === undefined) return refuse("bet-not-offered");
    if (!covers(latest, amount)) return refuse("balance");
    request = Object.freeze({ ...wanted });
    started = 0;
    awaited = undefined;
    publish({ kind: "running", count: wanted.count, left: wanted.count });
    next();
    return Object.freeze({ ok: true });
  };

  return Object.freeze({
    begin,
    stop,
    see,
    state: (): AutoplayState => state,
    running,
    onState: (listener: (next: AutoplayState) => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  });
};
