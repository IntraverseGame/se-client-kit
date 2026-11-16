// The game's mount for the open session (W-37, W-38): the controller bridge
// for the session's D, its allow-list, own origin, environment, and pick use
// case, all fixed at open; W-38's hold at the mount; and what stops an
// autoplay run on the game's side (a game not compatible, a `playback` copy
// that failed closed; RFC-005 section 6). The UI gets the mount's answer and
// the `layout` sender (RFC-005), never the bridge.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { AutoplayStop } from "./autoplay-types.ts";
import type { Environment } from "./chain-config.ts";
import {
  type ControllerBridge,
  createControllerBridge,
  type PickUseCase,
} from "./controller-bridge.ts";
import type { GameMount, GameMountOptions } from "./session-types.ts";

export type GameMountingHost = {
  /** D, the redeem answer's `gameOrigin`, fixed at open (W-37). */
  readonly gameOrigin: string;
  /** The path of the game's page on D, fixed at open (W-37). */
  readonly gamePath: string;
  readonly gameOrigins: readonly string[];
  readonly ownOrigin: string;
  readonly environment: Environment;
  readonly pick: PickUseCase;
  readonly ended: () => boolean;
  /** The session changed (W-53): nothing is forwarded to the game. */
  readonly changed: () => boolean;
  /** The latest Snapshot the hold gives the game at the mount (W-38). */
  readonly atMount: () => ValidSnapshot | undefined;
  /** Stops an autoplay run the game can no longer show. */
  readonly stopAutoplay: (reason: AutoplayStop) => void;
};

export type GameMounting = {
  readonly mountGame: (mount: GameMountOptions) => GameMount;
  /** The mounted bridge, while it is open. */
  readonly bridge: () => ControllerBridge | undefined;
  /** Closes the bridge: nothing more is sent to or accepted from the game. */
  readonly close: () => void;
};

export const createGameMounting = (host: GameMountingHost): GameMounting => {
  const gameOrigins: readonly string[] = Object.freeze([...host.gameOrigins]);
  let bridge: ControllerBridge | undefined;

  const close = (): void => {
    bridge?.close();
    bridge = undefined;
  };

  const mountGame = (mount: GameMountOptions): GameMount => {
    const origin = host.gameOrigin;
    if (host.ended()) {
      return Object.freeze({ ok: false, refusal: "session-ended" });
    }
    const result = createControllerBridge({
      ...mount,
      onIncompatible: () => {
        host.stopAutoplay("incompatible");
        mount.onIncompatible();
      },
      onCopy: copied => {
        if (!copied) host.stopAutoplay("playback-failed");
        mount.onCopy?.(copied);
      },
      gameOrigin: origin,
      gameOrigins,
      ownOrigin: host.ownOrigin,
      environment: host.environment,
      pick: host.pick,
    });
    if (!result.ok) {
      return Object.freeze({ ok: false, refusal: result.refusal });
    }
    close();
    const own = result.bridge;
    const mounted: GameMount = Object.freeze({
      ok: true,
      gameOrigin: origin,
      gamePath: host.gamePath,
      // A closed bridge sends nothing, so a changed session's mount sends no
      // `layout` either (W-53).
      layout: (insetBottom: number): void => {
        own.layout(insetBottom);
      },
    });
    if (host.changed()) {
      // A changed session forwards nothing to the game (W-53).
      own.close();
      return mounted;
    }
    bridge = own;
    // W-38's hold at the mount: a held Snapshot is not given.
    const latest = host.atMount();
    if (latest !== undefined) own.sendSnapshot(latest);
    return mounted;
  };

  return Object.freeze({ mountGame, bridge: () => bridge, close });
};
