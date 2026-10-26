// The game's controller: it says `hello`, takes the Wrapper's messages, and
// asks for a pick. It holds no key, no token, and no amount, and it decides
// nothing: the Wrapper validates and signs a pick, and the next Snapshot shows
// what happened. It touches no global: the parent window, its origin, and the
// message listener are injected.
//
// A message is taken only when its `source` is the parent window and its
// `origin` is the parent's origin, and only when it parses against
// `se.controller/1`; anything else is ignored without a trace. A Snapshot with
// a lower `version` than the latest is ignored too.

import type {
  GameSnapshot,
  RejectReason,
} from "@intraverse/se-client-shell/controller";

import {
  type CoinFlipRound,
  coinFlipRound,
  optionOf,
  type Side,
} from "./coin-flip.ts";
import {
  actionMessage,
  helloMessage,
  parseWrapperMessage,
} from "./protocol.ts";
import { type StepsRound, stepsRound } from "./steps-round.ts";

/** A window the game can post to (`window.parent`): only `postMessage`. */
export type MessageTarget = {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
};

/** The parts of a `MessageEvent` the game reads. */
export type IncomingMessage = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

/** Subscribes to the page's `message` events and returns the unsubscribe. */
export type ListenForMessages = (
  handler: (event: IncomingMessage) => void,
) => () => void;

/** What the game shows. */
export type GameView =
  /** The game is not in a frame, or does not know its parent's origin. */
  | {
      readonly kind: "unavailable";
      readonly reason: "not-framed" | "no-parent-origin";
    }
  /** `hello` is sent; no Snapshot has arrived yet. */
  | { readonly kind: "waiting" }
  /** The latest Snapshot has no rows to play. */
  | { readonly kind: "unsupported" }
  | {
      readonly kind: "round";
      readonly round: CoinFlipRound;
      /** The side the player asked for, until a Snapshot or a reject answers. */
      readonly pending: Side | undefined;
      /** Why the Wrapper did not accept the player's last pick. */
      readonly rejected: RejectReason | undefined;
    }
  /** A `steps` round that is not Coin Flip: rows of tiles. */
  | {
      readonly kind: "steps";
      readonly round: StepsRound;
      /** The tile the player asked for, until a Snapshot or a reject answers. */
      readonly pending: TilePick | undefined;
      readonly rejected: RejectReason | undefined;
    };

/** A tile of a row, as the game asks for it. */
export type TilePick = { readonly step: number; readonly option: number };

/** Why the view changed: the player's pick was answered, or anything else. */
export type ViewCause = "answered" | "update";

export type GameOptions = {
  /** `window.parent`, or `undefined` when the game is not framed. */
  readonly parent: MessageTarget | undefined;
  /** The parent's origin (parent-origin.ts), or `undefined` when unknown. */
  readonly parentOrigin: string | undefined;
  readonly listen: ListenForMessages;
  /** Called with every new view. */
  readonly onView: (view: GameView, cause: ViewCause) => void;
};

export type Game = {
  readonly view: () => GameView;
  /** Asks the Wrapper for a pick; ignored unless the round takes one now. */
  readonly pick: (side: Side) => void;
  /** Asks for a tile of a `steps` round; ignored unless it takes one now. */
  readonly pickTile: (step: number, option: number) => void;
  /** Stops listening; nothing more is sent or taken. */
  readonly close: () => void;
};

type Pending = {
  readonly id: string;
  readonly side: Side;
  /** The latest Snapshot's version when the pick was asked for. */
  readonly version: number;
};

type PendingTile = TilePick & {
  readonly id: string;
  /** The latest Snapshot's version when the pick was asked for. */
  readonly version: number;
};

const freeze = (view: GameView): GameView => Object.freeze(view);

/** What `pick` and `close` do when the game talks to nobody. */
const ignore = (): void => {
  // Nothing to send and nothing to stop.
};

export const createGame = (options: GameOptions): Game => {
  const { parent, parentOrigin } = options;
  if (parent === undefined || parentOrigin === undefined) {
    const view = freeze({
      kind: "unavailable",
      reason: parent === undefined ? "not-framed" : "no-parent-origin",
    });
    options.onView(view, "update");
    return Object.freeze({
      view: () => view,
      pick: ignore,
      pickTile: ignore,
      close: ignore,
    });
  }

  let latest: CoinFlipRound | undefined;
  let latestSteps: StepsRound | undefined;
  let latestVersion: number | undefined;
  let unsupported = false;
  let pending: Pending | undefined;
  let pendingTile: PendingTile | undefined;
  let rejected: RejectReason | undefined;
  let picks = 0;
  let closed = false;

  const view = (): GameView => {
    if (unsupported) return freeze({ kind: "unsupported" });
    if (latestSteps !== undefined) {
      return freeze({
        kind: "steps",
        round: latestSteps,
        pending:
          pendingTile === undefined
            ? undefined
            : { step: pendingTile.step, option: pendingTile.option },
        rejected,
      });
    }
    if (latest === undefined) return freeze({ kind: "waiting" });
    return freeze({
      kind: "round",
      round: latest,
      pending: pending?.side,
      rejected,
    });
  };

  const emit = (cause: ViewCause): void => {
    options.onView(view(), cause);
  };

  const onSnapshot = (snapshot: GameSnapshot): void => {
    if (latestVersion !== undefined && snapshot.version < latestVersion) return;
    const advanced =
      latestVersion === undefined || snapshot.version > latestVersion;
    latestVersion = snapshot.version;
    // Coin Flip keeps its own page; every other `steps` round is rows of tiles.
    const round = coinFlipRound(snapshot);
    const rows = round === undefined ? stepsRound(snapshot) : undefined;
    unsupported = round === undefined && rows === undefined;
    latest = round;
    latestSteps = rows;
    const answered =
      (pending !== undefined && snapshot.version > pending.version) ||
      (pendingTile !== undefined && snapshot.version > pendingTile.version);
    if (answered || round === undefined) pending = undefined;
    if (answered || rows === undefined) pendingTile = undefined;
    if (advanced) rejected = undefined;
    emit(answered ? "answered" : "update");
  };

  const onReject = (id: string, reason: RejectReason): void => {
    // Only the answer to the game's own outstanding pick counts.
    if (pending?.id !== id && pendingTile?.id !== id) return;
    pending = undefined;
    pendingTile = undefined;
    rejected = reason;
    emit("answered");
  };

  const unlisten = options.listen(event => {
    if (closed || event.source !== parent || event.origin !== parentOrigin) {
      return;
    }
    const message = parseWrapperMessage(event.data);
    if (message === undefined) return;
    if (message.type === "snapshot") onSnapshot(message.snapshot);
    else onReject(message.id, message.reason);
  });

  parent.postMessage(helloMessage(), parentOrigin);
  emit("update");

  return Object.freeze({
    view,
    pick: (side: Side): void => {
      if (closed || pending !== undefined || latest?.open !== true) return;
      const { step } = latest;
      if (step === undefined) return;
      picks += 1;
      pending = { id: `pick-${String(picks)}`, side, version: latest.version };
      rejected = undefined;
      parent.postMessage(
        actionMessage(pending.id, step, optionOf(side)),
        parentOrigin,
      );
      emit("update");
    },
    pickTile: (step: number, option: number): void => {
      if (closed || pendingTile !== undefined || latestSteps?.open !== true) {
        return;
      }
      const row = latestSteps.steps.find(candidate => candidate.index === step);
      if (
        latestSteps.step !== step ||
        row === undefined ||
        option >= row.optionCount
      ) {
        return;
      }
      picks += 1;
      pendingTile = {
        id: `pick-${String(picks)}`,
        step,
        option,
        version: latestSteps.version,
      };
      rejected = undefined;
      parent.postMessage(
        actionMessage(pendingTile.id, step, option),
        parentOrigin,
      );
      emit("update");
    },
    close: (): void => {
      if (closed) return;
      closed = true;
      unlisten();
    },
  });
};
