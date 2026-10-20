// Test-only: a fake game frame and the page's `message` listener, standing for
// the iframe's `contentWindow` and `window.addEventListener("message", ...)`.
// Every message the bridge posts is structured-cloned, as `postMessage` does,
// so a value that could not cross a real frame fails the test.

import {
  type ControllerBridge,
  type ControllerBridgeOptions,
  type ControllerBridgeResult,
  createControllerBridge,
  type GameFrame,
  type GameMessageEvent,
  type PickOutcome,
} from "../controller-bridge.ts";
import {
  CONTROLLER_SCHEMA,
  type HelloMessage,
  type Pick,
  type RejectReason,
  ROUND_STATUSES,
} from "../controller-protocol.ts";
import type { GameMountOptions } from "../session-types.ts";
import { snapshot } from "./vectors.ts";

export const GAME_ORIGIN = "https://game.example.net";
export const SE_ORIGIN = "https://play.example.com";

/** A message the bridge posted, with the target origin it named. */
export type Posted = {
  readonly message: unknown;
  readonly targetOrigin: string;
};

export type FakeGame = {
  readonly frame: GameFrame;
  readonly posted: Posted[];
  /** Delivers a `message` event, from the frame and D unless told otherwise. */
  readonly send: (
    data: unknown,
    from?: { readonly source?: unknown; readonly origin?: string },
  ) => void;
  readonly listening: () => boolean;
  readonly options: ControllerBridgeOptions;
  /** The picks the use case received. */
  readonly picks: Pick[];
  /** Settles the oldest pending pick. */
  readonly settle: (outcome: PickOutcome) => Promise<void>;
  readonly incompatible: () => number;
};

/** A hello that declares `steps` and all seven statuses. */
export const HELLO: HelloMessage = Object.freeze({
  schema: CONTROLLER_SCHEMA,
  type: "hello",
  presentations: Object.freeze(["steps"] as const),
  statuses: ROUND_STATUSES,
});

/** An `action` pick request. */
export const action = (
  id: string,
  step: number,
  option: number,
): Readonly<Record<string, unknown>> => ({
  schema: CONTROLLER_SCHEMA,
  type: "action",
  id,
  verb: "pick",
  args: { step, option },
});

export const createFakeGame = (
  overrides: Partial<ControllerBridgeOptions> = {},
): FakeGame => {
  const posted: Posted[] = [];
  const picks: Pick[] = [];
  const pending: ((outcome: PickOutcome) => void)[] = [];
  let handler: ((event: GameMessageEvent) => void) | undefined;
  let incompatible = 0;
  const frame: GameFrame = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      posted.push({ message: structuredClone(message), targetOrigin });
    },
  };
  const options: ControllerBridgeOptions = {
    gameOrigin: GAME_ORIGIN,
    gameOrigins: [GAME_ORIGIN],
    ownOrigin: SE_ORIGIN,
    environment: "production",
    frame,
    listen: (next): (() => void) => {
      handler = next;
      return (): void => {
        handler = undefined;
      };
    },
    pick: (request: Pick): Promise<PickOutcome> => {
      picks.push(request);
      return new Promise<PickOutcome>(resolve => {
        pending.push(resolve);
      });
    },
    onIncompatible: (): void => {
      incompatible += 1;
    },
    ...overrides,
  };
  return {
    frame,
    posted,
    send: (data, from = {}): void => {
      handler?.({
        source: "source" in from ? from.source : options.frame,
        origin: from.origin ?? GAME_ORIGIN,
        data,
      });
    },
    listening: (): boolean => handler !== undefined,
    options,
    picks,
    settle: async (outcome: PickOutcome): Promise<void> => {
      const resolve = pending.shift();
      if (resolve === undefined) throw new Error("no pick is pending");
      resolve(outcome);
      // Let the bridge's `then` run.
      await Promise.resolve();
      await Promise.resolve();
    },
    incompatible: (): number => incompatible,
  };
};

/** Mounts a bridge over `game`, failing the test on a refusal. */
export const mount = (game: FakeGame): ControllerBridge => {
  const result: ControllerBridgeResult = createControllerBridge(game.options);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.bridge;
};

/** A `reject` message as the game receives it. */
export const reject = (id: string, reason: RejectReason): unknown => ({
  schema: CONTROLLER_SCHEMA,
  type: "reject",
  id,
  reason,
});

export type ReadyGame = FakeGame & { readonly bridge: ControllerBridge };

/**
 * A bridge past its hello, holding the active golden round (step 1 of three
 * steps, three options), with nothing posted yet.
 */
export const ready = (
  overrides: Partial<ControllerBridgeOptions> = {},
): ReadyGame => {
  const game = createFakeGame(overrides);
  const bridge = mount(game);
  game.send(HELLO);
  bridge.sendSnapshot(snapshot("active"));
  game.posted.length = 0;
  return { ...game, bridge };
};

/**
 * The mount a UI gives the session: the fake game's frame, its messages, and
 * the notice; the game origin, the allow-list, the own origin, and the pick are
 * the session's.
 */
export const mountOf = (game: FakeGame): GameMountOptions => {
  const {
    gameOrigin: _d,
    gameOrigins: _list,
    ownOrigin: _own,
    environment: _environment,
    pick: _pick,
    ...frame
  } = game.options;
  return frame;
};
