// Test-only: requests built from the worked round of the signing vectors.

import type { TranscriptRequest } from "@intraverse/se-client-signing";

import type { RoundSigner } from "../round-signer.ts";
import { snapshot, type WorkedAction, workedActions } from "./vectors.ts";

export const requestOf = (vector: WorkedAction): TranscriptRequest => ({
  kind: vector.kind,
  action: vector.action,
  path: vector.path,
});

const worked = (index: number): WorkedAction => {
  const vector = workedActions[index];
  if (vector === undefined) throw new TypeError(`no worked action ${index}`);
  return vector;
};

/** The worked round's moves, in order. */
export const moves: readonly WorkedAction[] = workedActions.filter(
  vector => vector.kind === "action",
);

/** The worked round's cash-out, its last message. */
export const cashOut: WorkedAction = worked(workedActions.length - 1);

export const firstMove: TranscriptRequest = requestOf(worked(0));
export const secondMove: TranscriptRequest = requestOf(worked(1));

/** A first move other than the worked round's. */
export const otherFirstMove: TranscriptRequest = {
  kind: "action",
  action: "pick row 0 tile 1",
  path: [0],
};

/** Signs the first `count` moves of the worked round and sees each applied. */
export const playMoves = (round: RoundSigner, count: number): void => {
  for (const vector of moves.slice(0, count)) {
    round.sign(requestOf(vector));
    round.observe(snapshot("active", { step: vector.sequence }));
  }
};
