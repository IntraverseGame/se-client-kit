// The Wrapper's composition of the session (W-1 to W-14, W-24, W-26, W-37):
// it shows the outcome of opening the session, connects the session's read and
// intents to the UI, and mounts the game iframe through the shell's bridge for
// the game origin D the session holds. It hands the UI only validated
// Snapshots, typed errors, and the shell's read-only checks; it never sees a
// key, a token, the launch code, or a signing capability.

import type {
  PlaySession,
  RoundState,
  SessionOpening,
  SessionRead,
} from "@intraverse/se-client-shell";

import { messagesFor } from "./messages.ts";
import type { RoundCheck, ShownAmount, SnapshotRead } from "./round-input.ts";
import type { ChangeCause } from "./view-options.ts";
import type { WrapperApp } from "./wrapper-app.ts";

/** The parts of the page's window the game boundary uses. */
export type GameWindow = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  readonly removeEventListener: (
    type: "message",
    listener: (event: MessageEvent) => void,
  ) => void;
  /** The Wrapper's own origin, the SE origin. */
  readonly origin: string;
};

export type SessionWiringOptions = {
  readonly app: WrapperApp;
  readonly doc: Document;
  readonly window: GameWindow;
};

/** The shell's checks of the round, as the UI reads them. */
const checkOf = (round: RoundState): RoundCheck => ({
  verdict:
    round.verdict === "failed"
      ? (round.shown ?? "verification-failed")
      : round.verdict,
  outOfSync: round.outOfSync,
  cashOutOffered: round.cashOutOffered,
  cancel: round.cancel,
  ...(round.unconfirmed === undefined
    ? {}
    : { unconfirmed: round.unconfirmed }),
});

/** A session's answer, as the UI's read port gives it. */
export const uiReadOf = (
  session: PlaySession,
  read: SessionRead,
): SnapshotRead => {
  switch (read.kind) {
    case "snapshot": {
      const round = session.round();
      return round !== undefined && round.roundId === read.snapshot.roundId
        ? { kind: "snapshot", snapshot: read.snapshot, check: checkOf(round) }
        : { kind: "snapshot", snapshot: read.snapshot };
    }
    case "refused": {
      return read.reason === "session-ended"
        ? { kind: "session-ended" }
        : { kind: "refused" };
    }
    default: {
      return read;
    }
  }
};

/**
 * Shows what opening the session led to, and returns the session when one
 * opened. No launch code and a failed redeem are the session-ended state with
 * the relaunch instruction (W-1a, W-2); a tab without the signer lock is the
 * "open in another tab" state, and a browser without Web Locks its own state
 * (W-14): neither signs, refreshes, or polls.
 */
export const showOpening = (
  app: WrapperApp,
  opening: SessionOpening,
): PlaySession | undefined => {
  switch (opening.kind) {
    case "open": {
      return opening.session;
    }
    case "other-tab": {
      app.block("other-tab");
      return undefined;
    }
    case "unsupported": {
      app.block("unsupported-browser");
      return undefined;
    }
    default: {
      app.block("session-ended");
      return undefined;
    }
  }
};

/** The bet a `start` sends: the Snapshot's own `Amount` fields (W-22, W-34). */
const betOf = (amount: ShownAmount): Parameters<PlaySession["start"]>[0] => ({
  value: amount.value,
  unit: amount.unit,
  decimals: amount.decimals,
});

/**
 * The game frame's URL: D's root, with the Wrapper's own origin as
 * `parentOrigin` (decided in human review, 2026-10-17), which the game checks
 * against `location.ancestorOrigins[0]` where that exists. It is not a secret.
 * Built with the `URL` API, never by joining strings.
 */
export const gameUrlOf = (gameOrigin: string, ownOrigin: string): string => {
  const url = new URL("/", gameOrigin);
  url.searchParams.set("parentOrigin", ownOrigin);
  return url.href;
};

/**
 * Mounts the game iframe for the session's D, the redeem answer's `gameOrigin`
 * (W-37): sandboxed, titled, and pointed at D only once the shell's bridge
 * accepted it (D a serialized origin, on the `gameOrigins` the session was
 * opened with, and not the Wrapper's own). A refused D is never loaded: the
 * frame is removed without a `src`.
 */
const mountGame = (
  options: SessionWiringOptions,
  session: PlaySession,
): void => {
  const { app, doc, window } = options;
  const frame = doc.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = messagesFor(app.state().snapshot?.context.language).messages[
    "label.game"
  ];
  app.gameHost().append(frame);
  const target = frame.contentWindow;
  if (target === null) {
    frame.remove();
    return;
  }
  const mounted = session.mountGame({
    frame: target,
    listen: handler => {
      const listener = (event: MessageEvent): void => {
        handler({
          source: event.source,
          origin: event.origin,
          data: event.data,
        });
      };
      window.addEventListener("message", listener);
      return (): void => {
        window.removeEventListener("message", listener);
      };
    },
    onIncompatible: () => {
      app.gameIncompatible();
    },
  });
  if (!mounted.ok) {
    frame.remove();
    return;
  }
  frame.src = gameUrlOf(mounted.gameOrigin, window.origin);
};

/**
 * Connects an open session to the UI: its read port (polled per W-35, also the
 * background read of a cancel in `check-later`), the start, cash-out,
 * new-round, and "check again" intents, the answers of the game's picks, and
 * the session's end (W-7). Then mounts the game.
 */
export const wireSession = (
  options: SessionWiringOptions,
  session: PlaySession,
): void => {
  const { app } = options;
  const show = (read: SessionRead, cause: ChangeCause): void => {
    if (read.kind === "refused" && read.reason === "lock-not-held") {
      // The lock was lost: this page signs nothing more (W-14).
      app.block("other-tab", cause);
      return;
    }
    app.accept(uiReadOf(session, read), cause);
  };
  // One start, cash-out, or "check again" at a time: a click while one is in
  // flight does nothing (the shell refuses a second start or cash-out too).
  let acting = false;
  // A use case that rejects acted on nothing the UI can show: the generic error.
  const run = (call: () => Promise<SessionRead>): void => {
    if (acting) return;
    acting = true;
    call()
      .then(
        read => {
          show(read, "player");
          return null;
        },
        () => {
          app.accept({ kind: "refused" }, "player");
          return null;
        },
      )
      .finally(() => {
        acting = false;
      });
  };
  session.onEnd(() => {
    app.block("session-ended");
  });
  session.onChange(read => {
    // A pick is the player's own action (W-46).
    show(read, "player");
  });
  app.connect({
    readSnapshot: async (): Promise<SnapshotRead> =>
      uiReadOf(session, await session.read()),
    intents: {
      start: (bet: ShownAmount): void => {
        run(() => session.start(betOf(bet)));
      },
      cashOut: (): void => {
        run(() => session.cashOut());
      },
      newRound: (): void => {
        app.newRound();
      },
      checkAgain: (): void => {
        run(() => session.checkAgain());
      },
    },
  });
  mountGame(options, session);
};
