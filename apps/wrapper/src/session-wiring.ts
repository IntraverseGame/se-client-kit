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

import type { MessageDispatch } from "./message-dispatch.ts";
import { messagesFor } from "./messages.ts";
import type { RoundCheck, ShownAmount, SnapshotRead } from "./round-input.ts";
import type { ChangeCause } from "./view-options.ts";
import type { WrapperApp } from "./wrapper-app.ts";

export type SessionWiringOptions = {
  readonly app: WrapperApp;
  readonly doc: Document;
  /** The Wrapper's own origin, the SE origin: the game URL's `parentOrigin`. */
  readonly ownOrigin: string;
  /** The page's one `message` listener: the game frame's route (W-49b). */
  readonly messages: MessageDispatch;
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
  ...(round.pending === undefined ? {} : { pending: round.pending }),
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
 * The game frame's URL: the game's page on D, at the redeem answer's `gamePath`
 * (`/`, D's root, when it has none), with the Wrapper's own origin as
 * `parentOrigin` (decided in human review, 2026-10-17), which the game checks
 * against `location.ancestorOrigins[0]` where that exists. It is not a secret.
 * Built with the `URL` API, never by joining strings; the path is an absolute
 * path that play-client checked, so the URL stays on D.
 */
export const gameUrlOf = (
  gameOrigin: string,
  gamePath: string,
  ownOrigin: string,
): string => {
  const url = new URL(gamePath, gameOrigin);
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
  const { app, doc, messages } = options;
  const frame = doc.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.setAttribute("referrerpolicy", "no-referrer");
  // Inert from its mount: no round is playable yet (W-58). The UI's next
  // update keeps it so until one is.
  frame.toggleAttribute("inert", true);
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
    // Only the frame's own messages reach the bridge (W-38, W-49b).
    listen: handler => messages.onGame(target, handler),
    onIncompatible: () => {
      app.gameIncompatible();
    },
    // A book round's `playback` copy that failed closed (W-38, W-55).
    onCopy: copied => {
      app.gameCopied(copied);
    },
  });
  if (!mounted.ok) {
    frame.remove();
    return;
  }
  frame.src = gameUrlOf(
    mounted.gameOrigin,
    mounted.gamePath,
    options.ownOrigin,
  );
};

/**
 * Connects an open session to the UI: its read port (polled per W-35, also the
 * background read of a cancel in `check-later`), the start, cash-out, and
 * "check again" intents, the answers of the game's picks, and the session's end
 * (W-7). Then mounts the game.
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
  // While a start or cash-out call (`call`, not "check again") is in flight,
  // no lobby or deposit is offered (W-49f).
  const run = (call: () => Promise<SessionRead>, isCall = false): void => {
    if (acting) return;
    acting = true;
    if (isCall) app.callInFlight(true);
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
        if (isCall) app.callInFlight(false);
      });
  };
  session.onEnd(() => {
    app.block("session-ended");
  });
  session.onChange(read => {
    // A pick is the player's own action, made in the frame (W-46).
    show(read, "pick");
  });
  app.connect({
    readSnapshot: async (): Promise<SnapshotRead> =>
      uiReadOf(session, await session.read()),
    intents: {
      start: (bet: ShownAmount): void => {
        run(() => session.start(betOf(bet)), true);
      },
      cashOut: (): void => {
        run(() => session.cashOut(), true);
      },
      checkAgain: (): void => {
        run(() => session.checkAgain());
      },
    },
  });
  mountGame(options, session);
};
