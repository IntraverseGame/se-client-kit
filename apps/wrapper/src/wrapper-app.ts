// The Wrapper's UI controller: it holds `WrapperState`, renders it, and polls
// the Snapshot while a round is `starting` or `resolving`, while the shell's
// cancel of the round is `settling` or `check-later` (W-35), or while the
// round's move or cash-out is not confirmed (W-16, in the background). It
// reads the Snapshot only through the read port the session hands it, which
// returns a validated Snapshot or typed error (W-28); it never sees a key or a
// token.
//
// The session (session-wiring.ts) supplies `readSnapshot` and the start,
// cash-out, and new-round intents through `connect`; its reads carry the
// shell's checks of the round (W-19, W-26), and the states it decides at open
// (`session-ended`, `other-tab`, `unsupported-browser`) arrive through `block`.

import type { EnvironmentConfig } from "./environment-config.ts";
import { createView } from "./render.ts";
import type {
  CancelState,
  RoundProgress,
  SnapshotRead,
} from "./round-input.ts";
import { createSnapshotPoller, type PollConfig } from "./snapshot-poller.ts";
import type { Timers } from "./timers.ts";
import type { ChangeCause, Intents, ViewOptions } from "./view-options.ts";
import {
  acceptRead,
  block,
  type BlockingState,
  clearProblem,
  initialState,
  isFinal,
  startNewRound,
  type WrapperState,
} from "./wrapper-state.ts";

/** The browser's online state and its changes (W-43). */
export type Connectivity = {
  readonly onLine: () => boolean;
  /** Calls back on `online` and `offline`; returns the unsubscribe. */
  readonly subscribe: (onChange: () => void) => () => void;
};

export type WrapperAppOptions = {
  readonly doc: Document;
  readonly host: HTMLElement;
  readonly timers: Timers;
  readonly connectivity?: Connectivity;
  /** The platform clipboard, for the round id's copy control (W-39). */
  readonly copyText?: (text: string) => Promise<void>;
  readonly pollConfig?: PollConfig;
};

/**
 * The player intents the session wires in (start, cash-out, new round, and
 * "check again").
 */
export type RoundIntents = Pick<
  Intents,
  "start" | "cashOut" | "newRound" | "checkAgain"
>;

export type WrapperApp = {
  /** Applies a validated environment configuration (W-26a, W-39). */
  readonly configure: (config: EnvironmentConfig) => void;
  /** Connects the session's Snapshot read and the round flows' intents. */
  readonly connect: (session: {
    readonly readSnapshot: () => Promise<SnapshotRead>;
    readonly intents?: RoundIntents;
  }) => void;
  /** A read the Wrapper did not poll for, such as the answer to an action. */
  readonly accept: (read: SnapshotRead, cause: ChangeCause) => void;
  /** Shows a blocking state (W-44). */
  readonly block: (state: BlockingState, cause?: ChangeCause) => void;
  /**
   * The player starts another round: the ended round's panel goes (W-40), and
   * the Snapshot is read again.
   */
  readonly newRound: () => void;
  /** The game's `hello` did not declare what the Wrapper sends (W-38). */
  readonly gameIncompatible: () => void;
  /** Where the game iframe is mounted (W-37); see `View.gameHost`. */
  readonly gameHost: () => HTMLElement;
  readonly state: () => WrapperState;
  readonly dispose: () => void;
};

/**
 * What the poller follows: the shown round, the shell's cancel of it, and
 * whether its move or cash-out is not confirmed (W-16).
 */
type Followed = {
  readonly round: RoundProgress | undefined;
  readonly cancel?: CancelState;
  readonly unconfirmed?: boolean;
};

const NOTHING: Followed = Object.freeze({ round: undefined });

/**
 * The round the poller follows, or none when nothing may be polled. While the
 * shell's cancel of the round is `settling` or `check-later`, its reads go on
 * through the round's own failed state, a typed error, or a rejected read, none
 * of which the player could retry (W-35: no cancel left unread); only a final
 * state stops them.
 */
const followed = (state: WrapperState): Followed => {
  const cancel = state.check?.cancel;
  if (cancel === "settling" || cancel === "check-later") {
    return isFinal(state) ? NOTHING : { round: state.snapshot, cancel };
  }
  return state.blocking === undefined && state.problem === undefined
    ? {
        round: state.snapshot,
        ...(cancel === undefined ? {} : { cancel }),
        unconfirmed: state.check?.unconfirmed !== undefined,
      }
    : NOTHING;
};

export const createWrapperApp = (options: WrapperAppOptions): WrapperApp => {
  let state: WrapperState = {
    ...initialState,
    offline: options.connectivity?.onLine() === false,
  };
  let verifyBaseUrl: string | undefined;
  let readSnapshot: (() => Promise<SnapshotRead>) | undefined;
  let roundIntents: RoundIntents = {};
  // The round whose `ended` cancel was followed by its one read (W-33).
  let endedReadFor: string | undefined;

  // `apply`, `view`, and `poller` refer to each other; each is called only
  // after all three exist.
  const apply = (next: WrapperState, cause: ChangeCause): void => {
    if (next === state) {
      return;
    }
    state = next;
    view.update(state, cause);
    const { round, cancel, unconfirmed } = followed(state);
    poller.follow(round, cancel, unconfirmed);
    const ended =
      state.check?.cancel === "ended" ? state.snapshot?.roundId : undefined;
    if (ended !== undefined && ended !== endedReadFor) {
      endedReadFor = ended;
      void readAfterEnded();
    }
  };

  /**
   * Once the shell's cancel ended a round, the Snapshot is read once, through
   * the session's read (W-33, W-35), so "round ended" shows the current
   * balance: a Snapshot or the session's end is applied as usual; a failed read
   * (no response, a typed error, a rejected answer) is dropped, and the round's
   * last balance stays, with no error state. It is never repeated for the
   * round. A final state (session ended, another tab) is kept: `acceptRead`
   * never replaces one, and a round in one never shows its cancel `ended`.
   */
  const readAfterEnded = async (): Promise<void> => {
    const port = readSnapshot;
    if (port === undefined) return;
    let read: SnapshotRead;
    try {
      read = await port();
    } catch {
      return;
    }
    if (read.kind === "snapshot" || read.kind === "session-ended") {
      apply(acceptRead(state, read), "poll");
    }
  };

  const readOnce = async (cause: ChangeCause): Promise<void> => {
    const port = readSnapshot;
    if (port === undefined) {
      return;
    }
    let read: SnapshotRead;
    try {
      read = await port();
    } catch {
      read = { kind: "network" };
    }
    apply(acceptRead(state, read), cause);
  };

  /** "Try again" (W-42): the Snapshot is read again, as the player asked. */
  const retry = (): void => {
    apply(clearProblem(state), "player");
    void readOnce("player");
  };

  /**
   * "Check again" (W-33, W-35, W-16): the session's read, as the player asked.
   * Like "try again", it first clears a typed error the round shows, so the
   * reads it stopped (the background read of a move not confirmed) resume.
   */
  const checkAgainOf = (check: () => void) => (): void => {
    apply(clearProblem(state), "player");
    check();
  };

  const viewOptions = (): ViewOptions => {
    const { checkAgain } = roundIntents;
    const intents: Intents = {
      ...roundIntents,
      ...(checkAgain === undefined
        ? {}
        : { checkAgain: checkAgainOf(checkAgain) }),
      ...(readSnapshot === undefined ? {} : { retry }),
      ...(options.copyText === undefined ? {} : { copyText: options.copyText }),
    };
    return verifyBaseUrl === undefined
      ? { intents }
      : { intents, verifyBaseUrl };
  };

  const view = createView(options.doc, options.host, viewOptions);

  const poller = createSnapshotPoller({
    read: (): Promise<SnapshotRead> =>
      readSnapshot === undefined
        ? Promise.resolve({ kind: "network" })
        : readSnapshot(),
    timers: options.timers,
    onRead: (read: SnapshotRead): void => {
      apply(acceptRead(state, read), "poll");
    },
    onSlow: (): void => {
      apply({ ...state, slow: true }, "poll");
    },
    ...(options.pollConfig === undefined ? {} : { config: options.pollConfig }),
  });

  const unsubscribe = options.connectivity?.subscribe(() => {
    const offline = options.connectivity?.onLine() === false;
    apply({ ...state, offline }, "poll");
    if (!offline && state.connectionProblem) {
      // The connection came back: read the Snapshot first (W-43).
      if (poller.running()) {
        poller.pollNow();
      } else {
        void readOnce("poll");
      }
    }
  });

  view.update(state, "poll");

  return Object.freeze({
    configure: (config: EnvironmentConfig): void => {
      verifyBaseUrl = config.verifyBaseUrl;
      apply(
        {
          ...state,
          chainNotIndependent: config.chain.degraded,
          connectionProblem: false,
        },
        "poll",
      );
    },
    connect: (session: {
      readonly readSnapshot: () => Promise<SnapshotRead>;
      readonly intents?: RoundIntents;
    }): void => {
      readSnapshot = session.readSnapshot;
      roundIntents = session.intents ?? {};
      view.update(state, "poll");
      void readOnce("poll");
    },
    accept: (read: SnapshotRead, cause: ChangeCause): void => {
      apply(acceptRead(state, read), cause);
    },
    block: (blocking: BlockingState, cause: ChangeCause = "poll"): void => {
      apply(block(state, blocking), cause);
    },
    newRound: (): void => {
      apply(startNewRound(state), "player");
      void readOnce("player");
    },
    gameIncompatible: (): void => {
      apply({ ...state, gameIncompatible: true }, "poll");
    },
    gameHost: (): HTMLElement => view.gameHost,
    state: (): WrapperState => state,
    dispose: (): void => {
      poller.stop();
      unsubscribe?.();
    },
  });
};
