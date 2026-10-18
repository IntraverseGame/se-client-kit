// Test-only: a scripted stand-in for the shell's `PlaySession`, so the
// Wrapper's wiring is tested without a key, a token, or a network. Reads,
// starts, and cash-outs answer from queues; the round's checks, the game
// origin, and the mount's answer are set by the test; changes and the end are
// fired by the test. Snapshots are the golden `valid/` vectors, which stand
// for what the shell validated (T-5).

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import type {
  Bet,
  GameMount,
  GameMountOptions,
  PlaySession,
  RoundState,
  SessionRead,
  ValidSnapshot,
} from "@intraverse/se-client-shell";

/** A valid Snapshot vector as the shell hands it over, validated by T-5. */
export const validSnapshot = (name: string): ValidSnapshot => {
  const file = snapshotVectors.valid[name] as { readonly input: unknown };
  return structuredClone(file.input) as ValidSnapshot;
};

export const snapshotRead = (name: string): SessionRead => ({
  kind: "snapshot",
  snapshot: validSnapshot(name),
});

export type FakeSession = {
  readonly session: PlaySession;
  /** What the next reads answer, in order (the last one repeats). */
  readonly reads: SessionRead[];
  readonly starts: Bet[];
  readonly cashOuts: () => number;
  /** How many reads the session served (`read`, not "check again"). */
  readonly served: () => number;
  /** How often the player asked to check again. */
  readonly checks: () => number;
  readonly answerStart: (read: SessionRead) => void;
  readonly answerCashOut: (read: SessionRead) => void;
  readonly setRound: (round: RoundState | undefined) => void;
  readonly setMount: (answer: (options: GameMountOptions) => GameMount) => void;
  readonly mounts: GameMountOptions[];
  /** Fires an answer that arrives outside a call (a game's pick). */
  readonly change: (read: SessionRead) => void;
  /** Ends the session, as a refresh failure would (W-7). */
  readonly endNow: () => void;
};

/** The next answer of a queue (the last one repeats). */
const next = (queue: SessionRead[]): SessionRead =>
  (queue.length > 1 ? queue.shift() : queue[0]) ?? { kind: "network" };

/** Reads past this many never answer (far more than any test makes). */
const READ_LIMIT = 1_000;

/** The D the stand-in's redeem gave it; `setMount` decides the bridge's verdict. */
export const FAKE_GAME_ORIGIN = "https://game.example.net";

/** By default the session refuses the mount, as an ended one does. */
const refuseMount = (_options: GameMountOptions): GameMount => ({
  ok: false,
  refusal: "session-ended",
});

export const createFakeSession = (): FakeSession => {
  const reads: SessionRead[] = [];
  const starts: Bet[] = [];
  const mounts: GameMountOptions[] = [];
  const startAnswers: SessionRead[] = [];
  const cashOutAnswers: SessionRead[] = [];
  const changeListeners = new Set<(read: SessionRead) => void>();
  const endListeners = new Set<() => void>();
  let cashOuts = 0;
  let checks = 0;
  let served = 0;
  let round: RoundState | undefined;
  let ended = false;
  let mount = refuseMount;
  const nextRead = (): Promise<SessionRead> =>
    Promise.resolve(ended ? { kind: "session-ended" } : next(reads));
  const session: PlaySession = {
    read: () => {
      served += 1;
      // A runaway read loop (a bug) is stopped here: the reads answer at once,
      // so it would never yield to a timer, and the test would hang instead of
      // failing on its count.
      if (served > READ_LIMIT) return new Promise<SessionRead>(() => {});
      return nextRead();
    },
    checkAgain: () => {
      checks += 1;
      return nextRead();
    },
    start: bet => {
      starts.push(bet);
      return Promise.resolve(next(startAnswers));
    },
    cashOut: () => {
      cashOuts += 1;
      return Promise.resolve(next(cashOutAnswers));
    },
    round: () => round,
    gameOrigin: () => FAKE_GAME_ORIGIN,
    mountGame: options => {
      mounts.push(options);
      return mount(options);
    },
    onChange: listener => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onEnd: listener => {
      endListeners.add(listener);
      return () => endListeners.delete(listener);
    },
    ended: () => ended,
    end: () => {
      ended = true;
    },
  };
  return {
    session,
    reads,
    starts,
    cashOuts: () => cashOuts,
    served: () => served,
    checks: () => checks,
    answerStart: read => startAnswers.push(read),
    answerCashOut: read => cashOutAnswers.push(read),
    setRound: value => {
      round = value;
    },
    setMount: answer => {
      mount = answer;
    },
    mounts,
    change: read => {
      for (const listener of changeListeners) listener(read);
    },
    endNow: () => {
      ended = true;
      for (const listener of endListeners) listener();
    },
  };
};
