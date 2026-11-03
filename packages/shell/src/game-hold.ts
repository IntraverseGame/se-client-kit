// W-38's hold (RFC-004): the one rule the session applies at each hand-off of a
// Snapshot to the game's bridge, `session-reads.ts`'s `show` and
// `session-play.ts`'s `mountGame`. The bridge knows no round or verdict (W-38's
// boundary), so the session holds the Snapshot, never the bridge.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { SessionRound } from "./session-round.ts";

/**
 * Whether the game's bridge is given `snapshot`, evaluated after the round
 * observed it: one that is not `active` is given; an `active` one only when it
 * is of the session's current round, whose verdict is `ready` and whose signer
 * is not out of sync (W-19). A re-issue is a `failed` verdict, and a round the
 * shell does not hold (a `ROUND_ACTIVE` resume, a round an earlier page left
 * open) has none, so both are held. A held Snapshot is never given to the
 * bridge, so it neither keeps nor forwards it (`hello` included).
 */
export const givenToGame = (
  snapshot: ValidSnapshot,
  flow: SessionRound | undefined,
): boolean =>
  snapshot.status !== "active" ||
  (flow !== undefined &&
    snapshot.roundId === flow.roundId &&
    flow.verdict().state === "ready" &&
    flow.phase() !== "out-of-sync");
