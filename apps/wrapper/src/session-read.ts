// A session's answer, as the UI's read port gives it (session-wiring.ts): a
// validated Snapshot with the shell's checks of its round when the session
// holds that round, a typed error, or the session's refusal. It hands the UI
// only validated Snapshots, typed errors, and the shell's read-only checks.

import type {
  PlaySession,
  RoundState,
  SessionRead,
} from "@intraverse/se-client-shell";

import type { RoundCheck, SnapshotRead } from "./round-input.ts";

/** The shell's checks of the round, as the UI reads them. */
const checkOf = (round: RoundState): RoundCheck => ({
  verdict:
    round.verdict === "failed"
      ? (round.shown ?? "verification-failed")
      : round.verdict,
  ...(round.failure === undefined ? {} : { failure: round.failure }),
  ...(round.tipFailure === undefined ? {} : { tipFailure: round.tipFailure }),
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
