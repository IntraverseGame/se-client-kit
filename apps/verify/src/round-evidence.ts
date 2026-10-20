// The round's public evidence as the page works on it (V-6 to V-13): the
// typed value `verify-api.ts` returns once a body validates. Nothing here
// parses; the field names are the Snapshot's (assumed shape, TODO(verify API)).
// Amounts are `bigint` (base units), never a `number`.

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
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
    readonly verifyingContract: string;
  };
  readonly signer: string;
  readonly signature: string;
};

export type StepEvidence = {
  readonly optionCount: number;
  readonly selectedIndex?: number | undefined;
  readonly losingIndex?: number | undefined;
};

export type PayoutEvidence = {
  /** Shown as given (V-6); never recomputed (V-13). */
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

/** The round's public evidence, by the Snapshot's names (assumed shape). */
export type RoundEvidence = {
  readonly roundId: string;
  readonly kernelVersion: number;
  readonly status: RoundStatus;
  readonly closeReason?: string | undefined;
  readonly payout?: PayoutEvidence | undefined;
  readonly steps: readonly StepEvidence[];
  readonly randomnessProof: RandomnessProofEvidence;
  readonly fairnessProof?: FairnessProofEvidence | undefined;
  readonly createRoundAuth?: CreateRoundAuthEvidence | undefined;
  readonly record?: RecordEvidence | undefined;
};

/**
 * A one-step, two-option config round: the only shape this page recomputes
 * (A-3, specs/verify-page.md). The shape is checked; no game is named.
 */
export const isOneStepTwoOptions = (evidence: RoundEvidence): boolean =>
  evidence.steps.length === 1 && evidence.steps[0]?.optionCount === 2;
