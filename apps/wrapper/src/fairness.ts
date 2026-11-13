// The fairness chip (W-59, RFC-005 section 3): what the shell has checked for
// the round the bar shows, in plain words. It reads the shell's verdicts only
// and claims nothing the shell did not check: never "Verified". It keys on
// the round's kind, not on the verdict alone, since a book round's verdict is
// `ready` too and must never read as a config round's. A failure wins and
// stays: a round whose verdict failed (any W-26 check, a re-issue, the tip
// check, W-26a's "could not verify the chain") or a changed book round (W-52)
// reads "Not verified" from then on, after it ends too and through the
// required cancel. An ended config round reads "Checked before play" only when
// its last verdict was `ready`.

import {
  type RoundCheck,
  type RoundFailure,
  type RoundTipFailure,
  roundEnded,
} from "./round-input.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

export type ChipKind =
  /** No round yet, or one the shell does not hold: how rounds are checked. */
  | "how"
  /** A config round being checked (W-26). */
  | "checking"
  /** A config round that passed W-26, and its last verdict was `ready`. */
  | "checked"
  /** As `checked`, under W-26a's degraded chain check (development). */
  | "dev"
  /** A round that failed verification, or a changed book round. */
  | "not-verified"
  /** A book round whose record stayed the same (W-52). */
  | "recorded";

export type ChipPlan = {
  readonly kind: ChipKind;
  /** The session's kind of round: a config round or a book round (W-53). */
  readonly game: "config" | "book";
  /** The round the chip speaks of, once it has ended (W-39's id and link). */
  readonly endedRoundId?: string;
  /** When `not-verified`: which check refused it, and why (W-48 labels). */
  readonly failure?: RoundFailure;
  readonly tipFailure?: RoundTipFailure;
  /** When `not-verified`: W-26a's "could not verify the chain". */
  readonly chainUnverified?: boolean;
};

type Verdict = Pick<RoundCheck, "verdict" | "failure" | "tipFailure">;

const failed = (verdict: Verdict): boolean =>
  verdict.verdict === "verification-failed" ||
  verdict.verdict === "chain-unverified" ||
  verdict.failure !== undefined;

/** The round the chip speaks of: the shown round's, else the ended round's. */
const roundOf = (
  state: WrapperState,
):
  | {
      readonly verdict: Verdict | undefined;
      readonly endedRoundId?: string;
    }
  | undefined => {
  const { snapshot, check, endedRound } = state;
  if (snapshot?.roundId !== undefined) {
    const over = roundEnded(snapshot, check?.cancel);
    const kept =
      endedRound?.roundId === snapshot.roundId ? endedRound.verdict : undefined;
    return {
      verdict: check ?? kept,
      ...(over ? { endedRoundId: snapshot.roundId } : {}),
    };
  }
  return endedRound === undefined
    ? undefined
    : { verdict: endedRound.verdict, endedRoundId: endedRound.roundId };
};

/** The chip for the state, or `undefined` where the bar shows none. */
export const chipOf = (state: WrapperState): ChipPlan | undefined => {
  const { snapshot } = state;
  if (snapshot === undefined || isFinal(state)) return undefined;
  if (state.blocking === "loading") return undefined;
  const game = snapshot.presentation === "playback" ? "book" : "config";
  const round = roundOf(state);
  const ended =
    round?.endedRoundId === undefined
      ? {}
      : { endedRoundId: round.endedRoundId };
  const verdict = round?.verdict;
  if (verdict === undefined) return { kind: "how", game };
  if (failed(verdict)) {
    return {
      kind: "not-verified",
      game,
      ...ended,
      ...(verdict.failure === undefined ? {} : { failure: verdict.failure }),
      ...(verdict.tipFailure === undefined
        ? {}
        : { tipFailure: verdict.tipFailure }),
      ...(verdict.verdict === "chain-unverified"
        ? { chainUnverified: true }
        : {}),
    };
  }
  if (game === "book") return { kind: "recorded", game, ...ended };
  // A round that ended before its verdict was decided claims nothing.
  if (verdict.verdict === "checking") {
    return {
      kind: round?.endedRoundId === undefined ? "checking" : "how",
      game,
    };
  }
  return {
    kind: state.chainNotIndependent ? "dev" : "checked",
    game,
    ...ended,
  };
};
