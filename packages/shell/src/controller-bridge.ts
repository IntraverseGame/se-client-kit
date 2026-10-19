// The game bridge (W-37, W-38, W-23's pre-check, the edge cases of a pick).
// The Wrapper mounts the game iframe and gives the bridge the frame's window,
// the game origin D, a way to listen for `message` events, and the pick use
// case. The bridge holds no key, no token, and no signing capability: it sends
// the game only the allow-listed copy of a validated Snapshot and `reject`
// messages, always with `targetOrigin = D`, and hands an accepted pick to the
// use case. It touches no global: the window and the listener are injected.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { Environment } from "./chain-config.ts";
import {
  type ActionMessage,
  CONTROLLER_SCHEMA,
  type HelloMessage,
  type Pick,
  type RejectReason,
  toGameSnapshot,
  type WrapperMessage,
} from "./controller-protocol.ts";
import { isCompatible, parseGameMessage } from "./game-message.ts";
import { isSerializedOrigin, mayShareSite } from "./serialized-origin.ts";

/** The game frame's window (`iframe.contentWindow`): only `postMessage`. */
export type GameFrame = {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
};

/** The parts of a `MessageEvent` the bridge reads. */
export type GameMessageEvent = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

/**
 * Subscribes to the page's `message` events (the platform's
 * `window.addEventListener("message", ...)`) and returns the unsubscribe.
 */
export type ListenForMessages = (
  handler: (event: GameMessageEvent) => void,
) => () => void;

/** What the pick use case answers: accepted, or a closed reject reason. */
export type PickOutcome =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: RejectReason };

/**
 * The pick use case: the security gate of a pick. The bridge's pre-check is an
 * early filter only: it reads the latest Snapshot sent to the game, and its
 * in-flight slot is freed when the use case settles, so a second pick for the
 * same step can pass it before the Snapshot that answers the first arrives. The
 * use case MUST therefore re-check W-23's legality against the shell's own
 * latest validated Snapshot, MUST refuse a step it has already signed (W-15),
 * checks what the bridge cannot (W-26 passed, no re-issue), and builds, signs,
 * and sends the move (W-23). It settles once the pick's outcome is known; until
 * then the bridge answers every other pick `busy`.
 */
export type PickUseCase = (pick: Pick) => Promise<PickOutcome>;

export type ControllerBridgeOptions = {
  /** The game origin D, the `sessions:redeem` answer's `gameOrigin` (W-37). */
  readonly gameOrigin: string;
  /** The configuration's allow-list of game origins (`gameOrigins`). */
  readonly gameOrigins: readonly string[];
  /** The Wrapper's own origin, the SE origin. */
  readonly ownOrigin: string;
  /**
   * The configuration's `environment`: only `local` exempts two loopback hosts
   * from the registrable-domain rule (W-37, ADR-007).
   */
  readonly environment: Environment;
  readonly frame: GameFrame;
  readonly listen: ListenForMessages;
  readonly pick: PickUseCase;
  /**
   * Called once when the game's first valid `hello` does not declare `steps`
   * and all seven statuses: the Wrapper shows the generic "game not compatible"
   * error. The bridge then sends nothing more.
   */
  readonly onIncompatible: () => void;
};

/** Why the bridge refused to mount the game (W-37). */
export type ControllerMountRefusal =
  /** D or the Wrapper's origin is not a serialized origin. */
  | "invalid-origin"
  /** D is not on the configuration's allow-list. */
  | "origin-not-allowed"
  /** D is the Wrapper's own origin. */
  | "same-origin"
  /**
   * D's host shares its comparison key (its last two labels) with the
   * Wrapper's: they may be on one registrable domain (W-37, ADR-007).
   */
  | "same-site";

/** Where the bridge is. */
export type ControllerBridgeState =
  /** No valid `hello` yet: nothing is sent to the game. */
  | "awaiting-hello"
  /** The game declared what the Wrapper sends. */
  | "ready"
  /** The game's `hello` did not: nothing is sent, nothing is accepted. */
  | "incompatible"
  /** `close` was called. */
  | "closed";

export type ControllerBridge = {
  /**
   * Gives the bridge a Snapshot that passed W-28. It is kept as the latest (a
   * lower `version` than the latest is ignored, W-29) and its allow-listed copy
   * is sent once the game is ready; before the `hello`, only the latest is kept
   * and it is sent when the `hello` arrives.
   */
  readonly sendSnapshot: (snapshot: ValidSnapshot) => void;
  readonly state: () => ControllerBridgeState;
  /** Stops listening; nothing more is sent or accepted. */
  readonly close: () => void;
};

export type ControllerBridgeResult =
  | { readonly ok: true; readonly bridge: ControllerBridge }
  | { readonly ok: false; readonly refusal: ControllerMountRefusal };

const checkMount = (
  options: ControllerBridgeOptions,
): ControllerMountRefusal | undefined => {
  const { gameOrigin, ownOrigin, gameOrigins, environment } = options;
  if (!isSerializedOrigin(gameOrigin) || !isSerializedOrigin(ownOrigin)) {
    return "invalid-origin";
  }
  if (gameOrigin === ownOrigin) return "same-origin";
  // W-37's "different registrable domain", by the comparison key (ADR-007).
  if (mayShareSite(gameOrigin, ownOrigin, environment)) return "same-site";
  if (!gameOrigins.includes(gameOrigin)) return "origin-not-allowed";
  return undefined;
};

/** The W-23 pre-check against the latest Snapshot sent to the game. */
const preCheck = (
  latest: ValidSnapshot | undefined,
  pick: Pick,
): RejectReason | undefined => {
  if (latest?.status !== "active") return "not_active";
  if (latest.config.kind !== "steps" || latest.step !== pick.step) {
    return "not_legal";
  }
  const step = latest.config.steps.find(s => s.index === pick.step);
  if (step === undefined || pick.option >= step.optionCount) return "not_legal";
  return undefined;
};

/**
 * Mounts the bridge to the game frame, or refuses (W-37). A message is accepted
 * only if its `source` is `frame` and its `origin` is D, and only if it parses
 * against `se.controller/1` (W-38).
 */
export const createControllerBridge = (
  options: ControllerBridgeOptions,
): ControllerBridgeResult => {
  const refusal = checkMount(options);
  if (refusal !== undefined) return Object.freeze({ ok: false, refusal });

  const { gameOrigin, frame, pick, onIncompatible } = options;
  let state: ControllerBridgeState = "awaiting-hello";
  let latest: ValidSnapshot | undefined;
  let sent: ValidSnapshot | undefined;
  let inFlight = false;

  const post = (message: WrapperMessage): void => {
    try {
      frame.postMessage(message, gameOrigin);
    } catch {
      // A frame that navigated away or throws: the message is dropped.
    }
  };

  const forward = (snapshot: ValidSnapshot): void => {
    const copy = toGameSnapshot(snapshot);
    if (copy === undefined) return;
    sent = snapshot;
    post(
      Object.freeze({
        schema: CONTROLLER_SCHEMA,
        type: "snapshot",
        snapshot: copy,
      }),
    );
  };

  const reject = (id: string, reason: RejectReason): void => {
    if (state !== "ready") return;
    post(
      Object.freeze({ schema: CONTROLLER_SCHEMA, type: "reject", id, reason }),
    );
  };

  const runPick = (id: string, request: Pick): void => {
    inFlight = true;
    const settle = (outcome: PickOutcome): void => {
      inFlight = false;
      if (!outcome.accepted) reject(id, outcome.reason);
    };
    let pending: Promise<PickOutcome>;
    try {
      pending = pick(request);
    } catch {
      settle({ accepted: false, reason: "not_active" });
      return;
    }
    void pending.then(settle, () => {
      // A use case that fails did not accept the pick.
      settle({ accepted: false, reason: "not_active" });
    });
  };

  const onHello = (hello: HelloMessage): void => {
    if (state !== "awaiting-hello") return;
    if (!isCompatible(hello)) {
      state = "incompatible";
      onIncompatible();
      return;
    }
    state = "ready";
    if (latest !== undefined) forward(latest);
  };

  const onAction = ({ id, args }: ActionMessage): void => {
    if (state !== "ready") return;
    if (inFlight) {
      reject(id, "busy");
      return;
    }
    const reason = preCheck(sent, args);
    if (reason === undefined) {
      runPick(id, args);
    } else {
      reject(id, reason);
    }
  };

  const onMessage = (event: GameMessageEvent): void => {
    if (state === "closed" || state === "incompatible") return;
    if (event.source !== frame || event.origin !== gameOrigin) return;
    const parsed = parseGameMessage(event.data);
    if (parsed.kind === "hello") {
      onHello(parsed.message);
    } else if (parsed.kind === "action") {
      onAction(parsed.message);
    } else if (parsed.kind === "invalid-action") {
      reject(parsed.id, "invalid");
    }
  };

  const unsubscribe = options.listen(onMessage);

  const bridge: ControllerBridge = Object.freeze({
    sendSnapshot: (snapshot: ValidSnapshot): void => {
      if (state === "closed" || state === "incompatible") return;
      if (latest !== undefined && snapshot.version < latest.version) return;
      latest = snapshot;
      if (state === "ready") forward(snapshot);
    },
    state: (): ControllerBridgeState => state,
    close: (): void => {
      if (state === "closed") return;
      state = "closed";
      unsubscribe();
    },
  });
  return Object.freeze({ ok: true, bridge });
};
