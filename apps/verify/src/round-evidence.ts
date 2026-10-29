// The round's public evidence as the page works on it (V-6 to V-13): the
// typed value `verify-api.ts` returns once a verify API body validates
// (`RoundVerification` of the vendored verify API document). Nothing here
// parses. The names are the page's own, kept from its checks; `verify-api.ts`
// maps the document's fields to them. Amounts are `bigint` (base units), never
// a `number`.

export type RoundStatus =
  | "idle"
  | "starting"
  | "active"
  | "resolving"
  | "won"
  | "lost"
  | "canceled";

export type ZkProofEvidence = {
  readonly status: string;
  readonly verifiedBy?: string | undefined;
  /** Shown as text, never followed (V-13). */
  readonly proofLink?: string | undefined;
};

export type NewRoundEvidence = {
  readonly roundId: string;
  readonly playerRef: string;
  readonly currency: string;
  /** Base units, read as `bigint` (never a `number`). */
  readonly betAmount: bigint;
  readonly gameId: number;
  readonly gameVersion: number;
  readonly circuitVersion: number;
  readonly roundSecretHash: string;
  readonly randomnessTarget: string;
  readonly actionKey: string;
  readonly payoutTermsHash: string;
};

export type CreateRoundAuthEvidence = {
  readonly newRound: NewRoundEvidence;
  readonly entropyChainId: number;
  readonly prepareWindow: number;
  readonly expiry: string;
  /** The EIP-712 domain the authorization is claimed to be signed under. */
  readonly domain: {
    readonly chainId: number;
    readonly verifyingContract: string;
  };
  readonly signer: string;
  readonly signature: string;
};

/** One node of the game's payout terms: the shape the page tests (A-3). */
export type TermsNodeEvidence = {
  readonly options: number;
  readonly losers: number;
  /** The nodes reachable after surviving this one; empty for a last node. */
  readonly next: readonly number[];
};

/** One step the round played: the node's options, the pick, and the loser. */
export type StepEvidence = {
  readonly optionCount: number;
  readonly selectedIndex?: number | undefined;
  readonly losingIndex?: number | undefined;
};

export type PayoutEvidence = {
  /**
   * The amount in the currency's units, written by this page from the base
   * units and `decimals` (V-6); never recomputed (V-13).
   */
  readonly formatted: string;
  /** Base units, read as `bigint` (never a `number`). */
  readonly value: bigint;
  readonly unit: string;
};

export type RandomnessProofEvidence = {
  readonly source: string;
  readonly blockNumber: bigint;
  readonly blockValue?: string | undefined;
  readonly blockExplorerUrl?: string | undefined;
  readonly roundSecretHash: string;
  readonly roundSecret?: string | undefined;
  readonly zkProof?: ZkProofEvidence | undefined;
};

export type FairnessProofEvidence = {
  readonly seedHash: string;
  readonly readyHash?: string | undefined;
  readonly seed?: string | undefined;
  readonly zkProof?: ZkProofEvidence | undefined;
};

export type RecordEvidence = {
  readonly chainId: number;
  readonly txHash: string;
  readonly explorerUrl?: string | undefined;
};

/** A row of a book mode's table and what it pays (`DrawnRow`, V-21). */
export type DrawnRowEvidence = {
  /** The row, 0-based in the table's order; `bigint`, never a `number`. */
  readonly index: bigint;
  /** The multiplier in thousandths of the base bet, base-10 text. */
  readonly multiplierMilli: string;
};

/**
 * A book round's own evidence (`BookVerification`, V-18 to V-21), with what a
 * book round's checks read that a config round reads elsewhere. Of it, only the
 * seed is recomputed (check 7); the rest is shown, not checked (V-13).
 */
export type BookEvidence = {
  /** `book.mode`, shown as text. */
  readonly mode: string;
  /** `book.drawn`: the row the round drew, as the API recorded it. */
  readonly drawn?: DrawnRowEvidence | undefined;
  /** `book.cost`, a whole number or a fraction, kept as its text. */
  readonly cost?: string | undefined;
  readonly merkleRoot?: string | undefined;
  readonly entryCount?: bigint | undefined;
  readonly totalWeight?: bigint | undefined;
  /** `game.packageHash`. */
  readonly packageHash: string;
  /**
   * `recomputed.draw`: the API's own redraw, never the page's result; compared
   * with `drawn` for consistency only (check 8).
   */
  readonly apiDraw?: DrawnRowEvidence | undefined;
  /** `entropy.chainId`, compared with the pinned chain id (check 6). */
  readonly entropyChainId?: number | undefined;
  /**
   * `reveal.seed`. A book round carries no `seedHash` (so no `fairnessProof`)
   * as a rule, and check 7 still compares its seed.
   */
  readonly seed?: string | undefined;
};

/** The round's public evidence, from the verify API's `RoundVerification`. */
export type RoundEvidence = {
  readonly roundId: string;
  /** `kernel.version`: the kernel version the round used (V-12a). */
  readonly kernelVersion: number;
  readonly status: RoundStatus;
  readonly closeReason?: string | undefined;
  /**
   * An `idle` round that will not be played: `voided` (it carries a
   * `voidReason`) or `refused` (a `rejectCode`, refused before any money
   * moved). The reason itself is not kept: the page does not show it.
   */
  readonly closure?: "voided" | "refused" | undefined;
  readonly payout?: PayoutEvidence | undefined;
  /** `shape`: the config shape chosen at the start; empty when the terms fix it. */
  readonly shape: readonly number[];
  /** `game.terms.nodes`. */
  readonly terms: readonly TermsNodeEvidence[];
  /** The steps the kernel's replay played (`recomputed.steps`), by the API. */
  readonly steps: readonly StepEvidence[];
  /**
   * The entropy block and the round-secret commitment; absent when the round is
   * not bound to a block yet, or never was.
   */
  readonly randomnessProof?: RandomnessProofEvidence | undefined;
  readonly fairnessProof?: FairnessProofEvidence | undefined;
  readonly createRoundAuth?: CreateRoundAuthEvidence | undefined;
  readonly record?: RecordEvidence | undefined;
  /** Set for a book round only: a body that carries `book` (V-18). */
  readonly book?: BookEvidence | undefined;
};

/**
 * A one-step, two-option config round with one loser: the only shape this page
 * recomputes (A-3, specs/verify-page.md). It reads the game's payout terms (one
 * last node of two options of which one loses) and the config shape (empty, or
 * the two options); no game is named.
 */
export const isOneStepTwoOptions = (evidence: RoundEvidence): boolean => {
  const [node] = evidence.terms;
  const [chosen] = evidence.shape;
  return (
    evidence.terms.length === 1 &&
    node?.options === 2 &&
    node.losers === 1 &&
    node.next.length === 0 &&
    (evidence.shape.length === 0 ||
      (evidence.shape.length === 1 && chosen === 2))
  );
};
