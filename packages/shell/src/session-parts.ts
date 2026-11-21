// What the session's use cases are built from (session-play.ts): the parts
// fixed at open, and what the session hands back to its opener.

import type { Clock, RandomUuid } from "@intraverse/se-client-play-client";

import type { DelegationInputs } from "./delegation-request.ts";
import type { RoundFlowOptions } from "./round-flow.ts";
import type { GameMountingHost } from "./session-mount.ts";
import type { SessionReads } from "./session-reads.ts";
import type { PlaySession } from "./session-types.ts";

export type PlaySessionParts = {
  /** The round flows' options: the signing session, transport, token, checks. */
  readonly flow: RoundFlowOptions;
  readonly randomUuid: RandomUuid;
  /** D, the redeem answer's `gameOrigin`, fixed at open (W-37). */
  readonly gameOrigin: string;
  /**
   * The path of the game's page on D, the redeem answer's `gamePath` (`/` when
   * it has none), fixed at open (W-37). Not a trust boundary: messages are
   * matched by D only.
   */
  readonly gamePath: string;
  /** The configuration's allow-list of game origins, fixed at open (W-37). */
  readonly gameOrigins: readonly string[];
  /** The Wrapper's own origin, the SE origin, fixed at open. */
  readonly ownOrigin: string;
  /** The configuration's `environment`, for W-37's loopback exemption. */
  readonly environment: GameMountingHost["environment"];
  readonly ended: () => boolean;
  readonly end: () => void;
  /** The session's clock: autoplay's interval between rounds (RFC-005). */
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** The wallet delegation's inputs, fixed at open (W-62 to W-67). */
  readonly delegation: DelegationInputs;
};

export type PlaySessionHandle = {
  readonly session: PlaySession;
  /** Tells the session's listeners it ended, and closes the game's bridge. */
  readonly notifyEnd: () => void;
  /**
   * What a changed session kept (W-53, W-27): the first and the differing
   * values of the four fields, and nothing else. Internal: the shell's own
   * evidence, never handed to the UI.
   */
  readonly change: SessionReads["change"];
};
