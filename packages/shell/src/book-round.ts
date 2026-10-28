// A book round (book-playback.md W-50 to W-52): a round of the `playback`
// presentation, started like any round (W-22: the bet and the action key's
// address, behind the signer lock) and then only read. Nothing is ever signed
// for it: no move, no cash-out, and no cancel, so the round holds no
// transcript state, and a pick or a cash-out is refused with no request sent
// (W-51). W-26's checks 1 to 5, the tip check, and the re-issue rule do not
// apply to it, and it has no `T_0` (W-52). In their place the shell checks
// that the round stays one round: once a Snapshot of the round carries
// `proofs.randomnessProof`, every later Snapshot of the round carries the same
// `source`, `blockNumber`, and `roundSecretHash`, and the same
// `config.packageHash`. A Snapshot that differs (one without
// `randomnessProof` after one with it included) is a changed round: the round
// fails verification ("this round failed verification") for good, and the
// first values and each differing one are kept in its evidence. The shell
// recomputes nothing from `roundSecret`. A change of the session's
// presentation, model, `config.kind`, or `config.model` is W-53's
// (session-presentation.ts), checked before this.
//
// It emits no log, metric, or event, and its evidence holds no key and no
// token.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { CancelState } from "./cancel-state.ts";
import type { PickOutcome, PickUseCase } from "./controller-bridge.ts";
import type { StartRequest } from "./create-round-auth.ts";
import { redacting } from "./redaction.ts";
import type { FlowVerdict, SessionRound } from "./session-round.ts";
import { isRoundOver } from "./snapshot-reading.ts";

/** What the shell sent in the start of a book round (W-27). */
export type BookStartRequest = StartRequest & {
  /** The start's idempotency key (W-22, W-36). */
  readonly idempotencyKey: string;
};

/** A book Snapshot's `proofs.randomnessProof`. */
export type BookRandomnessProof = NonNullable<
  ValidSnapshot["proofs"]
>["randomnessProof"];

/**
 * The values W-52 holds steady over a round: the `randomnessProof`'s `source`,
 * `blockNumber`, and `roundSecretHash` (each `undefined` when the Snapshot
 * carries none), and `config.packageHash`.
 */
export type BookRoundValues = {
  readonly source: string | undefined;
  readonly blockNumber: number | undefined;
  readonly roundSecretHash: string | undefined;
  readonly packageHash: string;
};

/** A book round's evidence (W-27, W-52): nothing in it is secret. */
export type BookRoundEvidence = {
  /** The start's request: its idempotency key, the bet, the key's address. */
  readonly request: BookStartRequest;
  /** Each distinct `randomnessProof` the round's Snapshots carried, in order. */
  readonly randomnessProofs: readonly BookRandomnessProof[];
  /** The values of the first Snapshot that carried `randomnessProof`. */
  readonly first: BookRoundValues | undefined;
  /** Each distinct set of values that differed from `first`, in order. */
  readonly changes: readonly BookRoundValues[];
};

/** A book round the session holds. */
export type BookRound = SessionRound & {
  readonly evidence: () => BookRoundEvidence;
};

export type BookRoundOptions = {
  /**
   * The session's W-53 guard: a Snapshot it does not admit is not read in.
   * Absent in the round's own tests.
   */
  readonly admit?: (snapshot: ValidSnapshot) => boolean;
};

const READY: FlowVerdict = Object.freeze({ state: "ready" });
const CHANGED: FlowVerdict = Object.freeze({
  state: "failed",
  shown: "verification-failed",
});

// A book round takes no input but the start (W-51): nothing is signed or sent.
const NO_INPUT: PickOutcome = Object.freeze({
  accepted: false,
  reason: "not_legal",
});

const refuse: PickUseCase = () => Promise.resolve(NO_INPUT);
const none = (): Promise<void> => Promise.resolve();

const valuesOf = (
  snapshot: ValidSnapshot,
  packageHash: string,
): BookRoundValues => {
  const proof = snapshot.proofs?.randomnessProof;
  return Object.freeze({
    source: proof?.source,
    blockNumber: proof?.blockNumber,
    roundSecretHash: proof?.roundSecretHash,
    packageHash,
  });
};

const sameValues = (a: BookRoundValues, b: BookRoundValues): boolean =>
  a.source === b.source &&
  a.blockNumber === b.blockNumber &&
  a.roundSecretHash === b.roundSecretHash &&
  a.packageHash === b.packageHash;

const PROOF_FIELDS = [
  "source",
  "blockNumber",
  "blockValue",
  "blockExplorerUrl",
  "roundSecretHash",
  "roundSecret",
] as const;

/** Two proofs alike in every field the kit keeps (a `zkProof` aside). */
const sameProof = (a: BookRandomnessProof, b: BookRandomnessProof): boolean =>
  PROOF_FIELDS.every(field => a[field] === b[field]) &&
  JSON.stringify(a.zkProof) === JSON.stringify(b.zkProof);

/**
 * The book round started with `request`, whose start answered `first` (a
 * validated `playback` Snapshot of the round). The round reads `first` when the
 * session observes it, as any later Snapshot.
 */
export const createBookRound = (
  round: { readonly roundId: string; readonly request: BookStartRequest },
  first: ValidSnapshot,
  options: BookRoundOptions = {},
): BookRound => {
  const { roundId, request } = round;
  let latest = first;
  let baseline: BookRoundValues | undefined;
  const changes: BookRoundValues[] = [];
  const proofs: BookRandomnessProof[] = [];

  const keepProof = (proof: BookRandomnessProof | undefined): void => {
    if (proof === undefined) return;
    if (proofs.some(kept => sameProof(kept, proof))) return;
    proofs.push(proof);
  };

  // W-52's consistency of one round, from the first Snapshot that carries
  // `randomnessProof` on.
  const check = (snapshot: ValidSnapshot): void => {
    if (snapshot.config.kind !== "book") return;
    const values = valuesOf(snapshot, snapshot.config.packageHash);
    if (baseline === undefined) {
      if (snapshot.proofs?.randomnessProof !== undefined) baseline = values;
      return;
    }
    if (sameValues(baseline, values)) return;
    if (!changes.some(change => sameValues(change, values))) {
      changes.push(values);
    }
  };

  const observe = (snapshot: ValidSnapshot): Promise<void> => {
    if (snapshot.status === "idle" || snapshot.roundId !== roundId) {
      return Promise.resolve();
    }
    if (options.admit?.(snapshot) === false) return Promise.resolve();
    // A stale read (a lower `version`, W-29) is ignored before W-52's check:
    // an older `starting` without `randomnessProof` is no change of the round.
    if (snapshot.version < latest.version) return Promise.resolve();
    latest = snapshot;
    keepProof(snapshot.proofs?.randomnessProof);
    check(snapshot);
    return Promise.resolve();
  };

  return redacting({
    roundId,
    verdict: (): FlowVerdict => (changes.length > 0 ? CHANGED : READY),
    // A book round never opens transcript state: it signs nothing.
    phase: (): "unopened" => "unopened",
    latest: (): ValidSnapshot => latest,
    over: (): boolean => isRoundOver(latest),
    // A book round has no cancel (W-51).
    cancel: (): CancelState => "none",
    lastError: (): Error | undefined => undefined,
    unconfirmed: (): undefined => undefined,
    observe,
    // The session reads a book round through its own reads; a round with no
    // cancel has no reads of its own (W-35), so these read nothing.
    refresh: none,
    checkAgain: none,
    pick: refuse,
    cashOut: (): Promise<PickOutcome> => Promise.resolve(NO_INPUT),
    cashOutOffered: (): boolean => false,
    evidence: (): BookRoundEvidence =>
      Object.freeze({
        request,
        randomnessProofs: Object.freeze([...proofs]),
        first: baseline,
        changes: Object.freeze([...changes]),
      }),
  });
};
