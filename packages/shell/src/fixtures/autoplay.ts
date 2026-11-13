// Test-only: autoplay's run (autoplay-run.ts) over fake ports: a manual
// timer, starts the test answers, and the session's latest Snapshot the test
// sets. Book Snapshots from fixtures/book.ts, validated.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { type AutoplayRun, createAutoplayRun } from "../autoplay-run.ts";
import type { AutoplayRequest, AutoplayStop } from "../autoplay-types.ts";
import type { Bet } from "../round-start.ts";
import type { RoundFailure, SessionRead } from "../session-types.ts";
import { bookInput, versioned } from "./book.ts";

export const BET: Bet = { value: "100", unit: "EUR", decimals: 2 };

export const REQUEST: AutoplayRequest = {
  count: 3,
  bet: BET,
  minIntervalMs: 2500,
};

export const read = (value: ValidSnapshot): SessionRead => ({
  kind: "snapshot",
  snapshot: value,
});

/** A book Snapshot of `status` at `version`, with `bet` changed by `edit`. */
export const book = (
  status: "idle" | "starting" | "won" | "lost",
  version: number,
  edit: (bet: Record<string, unknown>) => void = () => {},
): ValidSnapshot => {
  const input = bookInput(status);
  edit(input["bet"] as Record<string, unknown>);
  return versioned(input, version);
};

/** Lets a settled start's `then` run. */
const settled = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

type Timer = { readonly callback: () => void; readonly ms: number };

export type Harness = {
  readonly run: AutoplayRun;
  /** The bets each start sent. */
  readonly starts: Bet[];
  /** What the run handed to the UI. */
  readonly answers: SessionRead[];
  readonly timers: Timer[];
  readonly state: { latest: ValidSnapshot };
  /** Answers the start in flight and lets the run see it. */
  readonly answer: (value: SessionRead) => Promise<void>;
  /** The start in flight rejects. */
  readonly failStart: () => Promise<void>;
  /** A read the session made (the Wrapper's poll), seen by the run. */
  readonly see: (value: ValidSnapshot) => void;
  /** Fires the oldest timer. */
  readonly fire: () => void;
  readonly fail: (value: RoundFailure) => void;
  readonly close: () => void;
};

export const harness = (latest: ValidSnapshot = book("idle", 1)): Harness => {
  const starts: Bet[] = [];
  const answers: SessionRead[] = [];
  const timers: Timer[] = [];
  let pending:
    | {
        readonly resolve: (read: SessionRead) => void;
        readonly reject: (error: Error) => void;
      }
    | undefined;
  let failure: RoundFailure | undefined;
  let closed = false;
  const state = { latest };
  const run = createAutoplayRun({
    latest: () => state.latest,
    start: bet => {
      starts.push(bet);
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    failure: () => failure,
    closed: () => closed,
    answer: answer => {
      answers.push(answer);
    },
    setTimeout: (callback, ms) => {
      const timer = { callback, ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout: handle => {
      const at = timers.indexOf(handle as (typeof timers)[number]);
      if (at !== -1) timers.splice(at, 1);
    },
  });
  /** Answers the start in flight and lets the run see it. */
  const inFlight = () => {
    const call = pending;
    pending = undefined;
    if (call === undefined) throw new Error("no start in flight");
    return call;
  };
  const answer = async (value: SessionRead): Promise<void> => {
    const call = inFlight();
    if (value.kind === "snapshot") state.latest = value.snapshot;
    call.resolve(value);
    await settled();
  };
  /** The start in flight fails with no answer (a use case that rejected). */
  const failStart = async (): Promise<void> => {
    inFlight().reject(new Error("the start failed"));
    await settled();
  };
  /** A read the session made (the Wrapper's poll), seen by the run. */
  const see = (value: ValidSnapshot): void => {
    state.latest = value;
    run.see(read(value));
  };
  const fire = (): void => {
    const timer = timers.shift();
    if (timer === undefined) throw new Error("no timer");
    timer.callback();
  };
  return {
    run,
    starts,
    answers,
    timers,
    state,
    answer,
    failStart,
    see,
    fire,
    fail: (value: RoundFailure): void => {
      failure = value;
    },
    close: (): void => {
      closed = true;
    },
  };
};

/** Plays one round of the run: its start answered `starting`, then `result`. */
export const playRound = async (
  h: Harness,
  version: number,
  result: "won" | "lost" = "won",
): Promise<void> => {
  await h.answer(read(book("starting", version)));
  h.see(book(result, version + 1));
};

export const stopped = (h: Harness): AutoplayStop | undefined => {
  const state = h.run.state();
  return state.kind === "stopped" ? state.reason : undefined;
};
