// The Wrapper's UI controller: it holds `WrapperState`, renders it, and polls
// the Snapshot while a round is `starting` or `resolving`, while the shell's
// cancel of the round is `settling` or `check-later` (W-35), or while the
// round's move or cash-out is not confirmed (W-16, in the background). It
// reads the Snapshot only through the read port the session hands it, which
// returns a validated Snapshot or typed error (W-28); it never sees a key or a
// token. A Snapshot dropped for a lower `version` (W-29) where no poll runs is
// read again (snapshot-reread.ts).
//
// The session (session-wiring.ts) supplies `readSnapshot` and the start,
// cash-out, and "check again" intents through `connect`; its reads carry the
// shell's checks of the round (W-19, W-26), and the states it decides at open
// (`session-ended`, `other-tab`, `unsupported-browser`) arrive through `block`.

import { createAppExtras } from "./app-extras.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import { createResultFocus, followed } from "./poll-follow.ts";
import { createView } from "./render.ts";
import type { SnapshotRead } from "./round-input.ts";
import { createSnapshotPoller } from "./snapshot-poller.ts";
import {
  createSnapshotReread,
  droppedLower,
  readQuietly,
} from "./snapshot-reread.ts";
import type { ChangeCause, Intents, ViewOptions } from "./view-options.ts";
import type {
  RoundIntents,
  WrapperApp,
  WrapperAppOptions,
} from "./wrapper-app-types.ts";
import {
  acceptRead,
  block,
  type BlockingState,
  clearProblem,
  gameCopied,
  initialState,
  leaveEndedRound,
  type WrapperState,
} from "./wrapper-state.ts";

export type { RoundIntents, WrapperApp, WrapperAppOptions };

export const createWrapperApp = (options: WrapperAppOptions): WrapperApp => {
  let state: WrapperState = {
    ...initialState,
    offline: options.connectivity?.onLine() === false,
  };
  let verifyBaseUrl: string | undefined;
  let links: ViewOptions["links"];
  let calling = false;
  const extras = createAppExtras(options.timers.now);
  let readSnapshot: (() => Promise<SnapshotRead>) | undefined;
  let roundIntents: RoundIntents = {};
  // The round whose `ended` cancel was followed by its one read (W-33).
  let endedReadFor: string | undefined;
  // The ended round the player started another round from (W-40): its panel
  // goes once a Snapshot of another round is shown.
  let startedFrom: string | undefined;
  const focus = createResultFocus();
  // `apply`, `view`, `poller`, and `reread` refer to each other (called later).
  const apply = (next: WrapperState, cause: ChangeCause): void => {
    if (next === state) return;
    state = next;
    const shownRound = state.snapshot?.roundId;
    if (
      startedFrom !== undefined &&
      shownRound !== undefined &&
      shownRound !== startedFrom
    ) {
      state = leaveEndedRound(state, startedFrom);
      startedFrom = undefined;
    }
    state = extras.follow(state);
    view.update(state, focus.causeOf(state, cause));
    const { round, cancel, unconfirmed } = followed(state);
    poller.follow(round, cancel, unconfirmed);
    // A re-read stops the moment one may no longer run (W-35): no timer stays.
    if (!mayReread()) reread.stop();
    const ended =
      state.check?.cancel === "ended" ? state.snapshot?.roundId : undefined;
    if (ended !== undefined && ended !== endedReadFor) {
      endedReadFor = ended;
      void readQuiet();
    }
  };

  // A read nobody asked for (W-33, RFC-001 Q16), applied only as a Snapshot or
  // the session's end: after the shell's cancel ended a round, and when the
  // page returns. A final state is kept (`acceptRead` never replaces one).
  const readQuiet = (): Promise<void> =>
    readQuietly(readSnapshot, read => apply(acceptRead(state, read), "poll"));

  /** Applies a read; a Snapshot dropped for a lower `version` is read again. */
  const take = (read: SnapshotRead, cause: ChangeCause): void => {
    const lower = droppedLower(state, read);
    apply(acceptRead(state, read), cause);
    if (lower) reread.dropped();
  };

  const readOnce = async (cause: ChangeCause): Promise<void> => {
    const port = readSnapshot;
    if (port === undefined) return;
    let read: SnapshotRead;
    try {
      read = await port();
    } catch {
      read = { kind: "network" };
    }
    take(read, cause);
  };

  /** "Try again", "Back to start" (W-42): the Snapshot is read again. */
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
    const autoplay = extras.autoplay();
    const summary = extras.summary();
    return {
      intents,
      ...(verifyBaseUrl === undefined ? {} : { verifyBaseUrl }),
      ...(links === undefined ? {} : { links }),
      ...(calling ? { calling } : {}),
      ...(autoplay === undefined ? {} : { autoplay }),
      ...(summary === undefined ? {} : { summary }),
    };
  };

  const view = createView(options.doc, options.host, viewOptions);

  const poller = createSnapshotPoller({
    read: (): Promise<SnapshotRead> =>
      readSnapshot === undefined
        ? Promise.resolve({ kind: "network" })
        : readSnapshot(),
    timers: options.timers,
    onRead: (read: SnapshotRead): void => {
      take(read, "poll");
    },
    onSlow: (): void => {
      apply({ ...state, slow: true }, "poll");
    },
    ...(options.pollConfig === undefined ? {} : { config: options.pollConfig }),
  });

  // Only where no poll runs, no typed error or blocking state shows, and the
  // shell's cancel does not read the round itself (W-35).
  const mayReread = (): boolean =>
    readSnapshot !== undefined &&
    !poller.running() &&
    followed(state).round !== undefined &&
    state.check?.cancel !== "settling" &&
    state.check?.cancel !== "check-later";

  const reread = createSnapshotReread({
    read: (): Promise<SnapshotRead> =>
      readSnapshot === undefined
        ? Promise.resolve({ kind: "network" })
        : readSnapshot(),
    timers: options.timers,
    onRead: (read: SnapshotRead): boolean => {
      const lower = droppedLower(state, read);
      apply(acceptRead(state, read), "poll");
      return lower;
    },
    mayRead: mayReread,
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
      extras.configure(config.autoplay);
      apply(
        {
          ...state,
          chainNotIndependent: config.chain.degraded,
          connectionProblem: false,
        },
        "poll",
      );
    },
    allowLinks: (rules): void => {
      links = rules;
      view.update(state, "poll");
    },
    callInFlight: (inFlight): void => {
      calling = inFlight;
      view.update(state, "poll");
    },
    connect: (session): void => {
      readSnapshot = session.readSnapshot;
      extras.opened();
      const { start, ...others } = session.intents ?? {};
      roundIntents =
        start === undefined
          ? others
          : {
              ...others,
              start: bet => {
                startedFrom = state.endedRound?.roundId;
                focus.started();
                view.started();
                start(bet);
              },
            };
      view.update(state, "poll");
      void readOnce("poll");
    },
    accept: (read: SnapshotRead, cause: ChangeCause): void => {
      take(read, cause);
    },
    block: (blocking: BlockingState, cause: ChangeCause = "poll"): void => {
      apply(block(state, blocking), cause);
    },
    gameIncompatible: (): void => {
      apply({ ...state, gameIncompatible: true }, "poll");
    },
    gameCopied: (copied: boolean): void => {
      apply(gameCopied(state, copied), "poll");
    },
    gameHost: (): HTMLElement => view.gameHost,
    state: (): WrapperState => state,
    calling: (): boolean => calling || extras.running(),
    autoplayInterval: extras.interval,
    autoplayRun: (next): void => {
      extras.setRun(next);
      view.update(state, "poll");
    },
    gameCapable: (inset: boolean): void => {
      const { gameInset: _was, ...rest } = state;
      apply(inset ? { ...state, gameInset: true } : rest, "poll");
    },
    readQuiet,
    dispose: (): void => {
      poller.stop();
      reread.stop();
      unsubscribe?.();
    },
  });
};
