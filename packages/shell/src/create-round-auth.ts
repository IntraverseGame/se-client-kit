// The round's `CreateRoundAuth` checks (W-26, items 1 to 5), run before the
// first signature and before the game is shown as ready. Checks 1 to 4 run on
// the first Snapshot that carries `proofs.createRoundAuth`; check 5 runs when
// `proofs.fairnessProof.readyHash` arrives. The first check that fails refuses
// the round with its reason. The environment configuration is the only trust
// anchor (OQ-7): the Snapshot's domain, signer, and entropy chain id are
// compared with it, and every digest is built with the configured values,
// never with one taken from the response. The Snapshot is validated (W-28)
// before it reaches this module; its fields are still read as claims to check.
//
// `T_0` is settled only by `checkReady`, after checks 1 to 4 passed. The
// combination with the tip check, and so whether a `PlayerCancel` may be
// signed, is the round's verdict (round-verification.ts).

import {
  type Address,
  type Bytes32,
  domainSeparator,
  hashCreateRoundAuth,
  hashNewRound,
  hashRandomnessTarget,
  hashReady,
  recoverAddress,
  typedDataDigest,
} from "@intraverse/se-client-signing";
import {
  parseBaseUnits,
  type ValidSnapshot,
} from "@intraverse/se-client-snapshot";

import { asciiBytes32, roundIdBytes32 } from "./bytes32-text.ts";
import type { ChainConfig } from "./chain-config.ts";

/** A validated Snapshot's `proofs.createRoundAuth`. */
export type CreateRoundAuthProof = NonNullable<
  NonNullable<ValidSnapshot["proofs"]>["createRoundAuth"]
>;

/** Why a W-26 check refused the round, named as W-26 names them. */
export type CheckReason =
  /** Check 1, or a field a check needs still absent once the round is `active`. */
  | "missing"
  /** Check 2: the domain or the signer is not the configuration's. */
  | "pinned-mismatch"
  /** Check 3: `newRound` does not match the round, the shell, or the source. */
  | "cross-field"
  /** Check 4: the signature is not canonical or recovers to another signer. */
  | "recover-mismatch"
  /** Check 5: the recomputed `T_0` is not `readyHash`. */
  | "ready-mismatch";

/** What the shell sent in the round's `start` (W-22). */
export type StartRequest = {
  /** The action key's address (any case). */
  readonly actionKey: Address;
  /** The `AmountRequest` sent: base units as a decimal string, and its unit. */
  readonly bet: { readonly value: string; readonly unit: string };
};

/** The outcome of checks 1 to 4. */
export type AuthCheck =
  /** `starting` with no `proofs.createRoundAuth` yet: nothing to check. */
  | { readonly status: "waiting" }
  | {
      readonly status: "refused";
      readonly reason: Exclude<CheckReason, "ready-mismatch">;
    }
  | {
      readonly status: "passed";
      /** `keccak256(abi.encode(newRound))`, recomputed. */
      readonly created: Bytes32;
      /** The object that passed: the round's first, kept for W-26's re-issue. */
      readonly auth: CreateRoundAuthProof;
    };

declare const SETTLED: unique symbol;

/**
 * `T_0` once checks 1 to 5 passed (W-26): only `checkReady` makes one, so a
 * round's transcript state can be opened only with a settled value (W-22). A
 * plain `Bytes32` does not type-check where it is required.
 */
export type SettledInitial = Bytes32 & { readonly [SETTLED]: true };

/** The outcome of check 5. */
export type ReadyCheck =
  /** `starting` with no `readyHash` yet. */
  | { readonly status: "waiting" }
  | {
      readonly status: "refused";
      readonly reason: "missing" | "ready-mismatch";
    }
  | {
      /** `T_0` is settled: the round's first signed action links to it. */
      readonly status: "settled";
      readonly initial: SettledInitial;
    };

/**
 * The registry domain's fixed `name` and `version` (the Snapshot schema's
 * constants; the environment configuration pins only `chainId` and
 * `verifyingContract`, OQ-7). The one place the shell spells them.
 */
export const REGISTRY_DOMAIN_NAME = "SuperEngine";
export const REGISTRY_DOMAIN_VERSION = "1";

const safeBigInt = (value: number): bigint | undefined =>
  Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;

const sameAddress = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

/** Check 2: the round's domain and signer are the configured ones. */
const pinned = (config: ChainConfig, auth: CreateRoundAuthProof): boolean =>
  safeBigInt(auth.domain.chainId) === config.registryDomain.chainId &&
  sameAddress(
    auth.domain.verifyingContract,
    config.registryDomain.verifyingContract,
  ) &&
  sameAddress(auth.signer, config.runtimeSigner);

type Proofs = NonNullable<ValidSnapshot["proofs"]>;

/**
 * Check 3. Returns the `newRound` currency as `bytes32` when every field
 * matches, for check 4 to hash; `undefined` otherwise.
 */
const crossField = (
  config: ChainConfig,
  request: StartRequest,
  roundId: string,
  proofs: Proofs,
  auth: CreateRoundAuthProof,
): Bytes32 | undefined => {
  const { newRound } = auth;
  const { randomnessProof } = proofs;
  if (newRound.roundId !== roundIdBytes32(roundId)) return undefined;
  if (newRound.roundSecretHash !== randomnessProof.roundSecretHash) {
    return undefined;
  }
  if (!sameAddress(newRound.actionKey, request.actionKey)) return undefined;
  const sent = parseBaseUnits(request.bet.value);
  const signed = parseBaseUnits(newRound.betAmount);
  if (sent === undefined || signed === undefined || sent !== signed) {
    return undefined;
  }
  const unit = asciiBytes32(request.bet.unit);
  const currency = asciiBytes32(newRound.currency);
  if (unit === undefined || currency === undefined || unit !== currency) {
    return undefined;
  }
  const { source, blockNumber } = randomnessProof;
  const sourceConfig = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  if (
    sourceConfig === undefined ||
    safeBigInt(auth.entropyChainId) !== sourceConfig.chainId
  ) {
    return undefined;
  }
  const sourceWord = asciiBytes32(source);
  const block = safeBigInt(blockNumber);
  if (sourceWord === undefined || block === undefined) return undefined;
  // Recomputed with the pinned chain id, which check 3 has just shown equal
  // to the round's.
  const target = hashRandomnessTarget({
    source: sourceWord,
    entropyChainId: sourceConfig.chainId,
    blockNumber: block,
  });
  return newRound.randomnessTarget === target ? currency : undefined;
};

/** Check 4: `created`, when the signature recovers to the configured signer. */
const recovered = (
  config: ChainConfig,
  auth: CreateRoundAuthProof,
  currency: Bytes32,
): Bytes32 | undefined => {
  const { newRound } = auth;
  try {
    const created = hashNewRound({
      roundId: newRound.roundId as Bytes32,
      playerRef: newRound.playerRef as Bytes32,
      currency,
      betAmount: newRound.betAmount,
      gameId: newRound.gameId,
      gameVersion: newRound.gameVersion,
      circuitVersion: newRound.circuitVersion,
      roundSecretHash: newRound.roundSecretHash as Bytes32,
      randomnessTarget: newRound.randomnessTarget as Bytes32,
      actionKey: newRound.actionKey as Address,
      payoutTermsHash: newRound.payoutTermsHash as Bytes32,
    });
    const digest = typedDataDigest(
      domainSeparator({
        name: REGISTRY_DOMAIN_NAME,
        version: REGISTRY_DOMAIN_VERSION,
        chainId: config.registryDomain.chainId,
        verifyingContract: config.registryDomain.verifyingContract,
      }),
      hashCreateRoundAuth({
        created,
        prepareWindow: auth.prepareWindow,
        expiry: auth.expiry,
      }),
    );
    // Refuses a signature that is not canonical (W-21) and the zero address.
    const signer = recoverAddress(digest, auth.signature);
    return sameAddress(signer, config.runtimeSigner) ? created : undefined;
  } catch {
    // A field outside its type, or a signature recovery refused: fail closed.
    return undefined;
  }
};

const refused = (reason: Exclude<CheckReason, "ready-mismatch">): AuthCheck =>
  Object.freeze({ status: "refused", reason });

/**
 * Checks 1 to 4 on the first Snapshot of the round that carries
 * `proofs.createRoundAuth`. A `starting` Snapshot without `proofs` is
 * `waiting`. A Snapshot with `proofs` but no `proofs.createRoundAuth` (check
 * 1), and one past `starting` without it (a field absent by `active` fails), is
 * `missing`. An `idle` Snapshot is not a round's: `missing`.
 */
export const checkCreateRoundAuth = (
  config: ChainConfig,
  request: StartRequest,
  snapshot: ValidSnapshot,
): AuthCheck => {
  if (snapshot.status === "idle") return refused("missing");
  const { proofs } = snapshot;
  if (proofs === undefined) {
    return snapshot.status === "starting"
      ? Object.freeze({ status: "waiting" })
      : refused("missing");
  }
  // Check 1: a Snapshot that carries `proofs.randomnessProof` (every one that
  // carries `proofs`) carries `proofs.createRoundAuth`.
  const auth = proofs.createRoundAuth;
  if (auth === undefined) return refused("missing");
  if (!pinned(config, auth)) return refused("pinned-mismatch");
  const currency = crossField(config, request, snapshot.roundId, proofs, auth);
  if (currency === undefined) return refused("cross-field");
  const created = recovered(config, auth, currency);
  if (created === undefined) return refused("recover-mismatch");
  return Object.freeze({ status: "passed", created, auth });
};

/**
 * Check 5, after checks 1 to 4 passed with `created`: once the Snapshot carries
 * `proofs.fairnessProof.readyHash`, `T_0 = keccak256(abi.encode(created,
 * seedHash))` must equal it. Absent while `starting`, it is `waiting`; absent
 * on any other status, `missing`. `readyHash` is taken from the Snapshot as
 * given (its registry record waits on anchoring, a later increment).
 */
export const checkReady = (
  created: Bytes32,
  snapshot: ValidSnapshot,
): ReadyCheck => {
  if (snapshot.status === "idle") {
    return Object.freeze({ status: "refused", reason: "missing" });
  }
  const fairness = snapshot.proofs?.fairnessProof;
  const readyHash = fairness?.readyHash;
  if (fairness === undefined || readyHash === undefined) {
    return snapshot.status === "starting"
      ? Object.freeze({ status: "waiting" })
      : Object.freeze({ status: "refused", reason: "missing" });
  }
  let initial: Bytes32;
  try {
    initial = hashReady({ created, seedHash: fairness.seedHash as Bytes32 });
  } catch {
    return Object.freeze({ status: "refused", reason: "ready-mismatch" });
  }
  // The one place a `SettledInitial` is made: check 5 has just passed.
  return initial === readyHash
    ? Object.freeze({ status: "settled", initial: initial as SettledInitial })
    : Object.freeze({ status: "refused", reason: "ready-mismatch" });
};
