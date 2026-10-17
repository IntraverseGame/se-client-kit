// Whether a move or a cash-out is legal in the shell's own latest validated
// Snapshot of the round (W-23, W-24), and the canonical action it is signed as
// (W-20). The shell builds the text and the path itself; the game sends only
// which option it picked in which step.
//
// - A step's node id is its `config.steps[].index`. The node played is the one
//   at the Snapshot's `step` (the count of moves applied), and the path is the
//   node ids survived, then that one, so the row is `len(path) - 1`. The tile
//   appears only in the text.
// - The Snapshot's `step` must equal the moves the shell has seen applied: a
//   Snapshot behind the shell's own progress (an older read) never makes a
//   step it has signed legal again.
// - A cash-out needs a step survived and a step left: the move that survives
//   the last step ends the round `won` (W-24, OQ-8). Coin Flip has one step, so
//   it never offers a cash-out.

import {
  actionGrammar,
  SigningError,
  type TranscriptRequest,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { Pick, RejectReason } from "./controller-protocol.ts";

export type Legality =
  | {
      readonly legal: true;
      readonly request: TranscriptRequest;
      /** The position of the step played (`step`), for a move. */
      readonly row: number;
    }
  | {
      readonly legal: false;
      readonly reason: Exclude<RejectReason, "busy" | "invalid">;
    };

const index = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Whether `value` has the shape of a pick (two non-negative integers). */
export const isPick = (value: unknown): value is Pick => {
  if (typeof value !== "object" || value === null) return false;
  const { step, option } = value as { readonly [key: string]: unknown };
  return index(step) && index(option);
};

const refused = (reason: "not_legal" | "not_active"): Legality =>
  Object.freeze({ legal: false, reason });

type Step = { readonly index: number; readonly optionCount: number };

type AtProgress =
  | { readonly steps: readonly Step[] }
  | { readonly refusal: Legality };

/** The steps of an `active` steps round at the shell's own progress. */
const stepsAt = (
  snapshot: ValidSnapshot | undefined,
  applied: number,
): AtProgress => {
  if (snapshot?.status !== "active") return { refusal: refused("not_active") };
  if (snapshot.config.kind !== "steps" || snapshot.step !== applied) {
    return { refusal: refused("not_legal") };
  }
  return { steps: snapshot.config.steps };
};

const built = (make: () => TranscriptRequest, row: number): Legality => {
  try {
    return Object.freeze({ legal: true, request: make(), row });
  } catch (error) {
    // A node id outside `uint8`: not a path the shell can sign.
    if (error instanceof SigningError) return refused("not_legal");
    throw error;
  }
};

/**
 * W-23: the pick is legal when the round is `active`, its Snapshot is at the
 * shell's own progress (`applied` moves), the step picked is the next one, and
 * the option is in its range.
 */
export const legalMove = (
  snapshot: ValidSnapshot | undefined,
  applied: number,
  pick: Pick,
): Legality => {
  const at = stepsAt(snapshot, applied);
  if ("refusal" in at) return at.refusal;
  const { steps } = at;
  const node = steps[applied];
  if (node?.index !== pick.step || pick.option >= node.optionCount) {
    return refused("not_legal");
  }
  const path = steps.slice(0, applied + 1).map(step => step.index);
  return built(
    () => ({ kind: "action", ...actionGrammar.pick(path, pick.option) }),
    applied,
  );
};

/**
 * W-24: a cash-out is legal when the round is `active`, its Snapshot is at the
 * shell's own progress, at least one step was survived, and one is left.
 */
export const legalCashOut = (
  snapshot: ValidSnapshot | undefined,
  applied: number,
): Legality => {
  const at = stepsAt(snapshot, applied);
  if ("refusal" in at) return at.refusal;
  const { steps } = at;
  if (applied < 1 || applied >= steps.length) return refused("not_legal");
  const path = steps.slice(0, applied).map(step => step.index);
  return built(
    () => ({ kind: "cash-out", ...actionGrammar.cashOut(path) }),
    applied,
  );
};
