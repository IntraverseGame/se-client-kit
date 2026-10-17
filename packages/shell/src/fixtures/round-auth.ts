// Test-only: rounds for the W-26 checks. The vendored vectors give one round
// signed by the registry's test key (`valid/coinflip-active-ready-hash` and
// the `signature/` set); a case that needs another signed value (a changed
// chain, a past expiry, a wrong `readyHash`) is issued here by a registry key
// drawn from a seeded random source, whose address the configuration then
// pins. No key is written down: each is drawn at run time and stays in its
// signer.

import {
  type Address,
  type Bytes32,
  createSigner,
  domainSeparator,
  hashCreateRoundAuth,
  hashNewRound,
  hashRandomnessTarget,
  hashReady,
  type Signer,
  typedDataDigest,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import { asciiBytes32 } from "../bytes32-text.ts";
import type { ChainConfig } from "../chain-config.ts";
import {
  REGISTRY_DOMAIN_NAME,
  REGISTRY_DOMAIN_VERSION,
  type StartRequest,
} from "../create-round-auth.ts";
import { accepted, endpoints } from "./chain-config.ts";
import { recordingRandom } from "./seeded.ts";
import { validated, vectorInput } from "./vectors.ts";

/** The vendored round's entropy source. */
export const ROUND_SOURCE = "ethereum:block";

/** The vendored round's registry domain. */
export const ROUND_DOMAIN = {
  chainId: 31337,
  verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
} as const;

/** The vendored round's registry signer (the admin test key's address). */
export const ROUND_SIGNER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";

/** What the vendored round's shell sent in `start`. */
export const ROUND_REQUEST: StartRequest = {
  actionKey: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  bet: { value: "100", unit: "EUR" },
};

/** The vendored `active` round that carries `readyHash`. */
export const READY_VECTOR = "coinflip-active-ready-hash";

export type Pinned = {
  readonly chainId: number;
  readonly verifyingContract: string;
  readonly signer: string;
};

/**
 * A production configuration pinning `pinned`, with two endpoints for each
 * source in `chains` (source to its pinned entropy chain id).
 */
export const configFor = (
  pinned: Pinned,
  chainsGiven?: Readonly<Record<string, number>>,
): ChainConfig => {
  const chains = chainsGiven ?? { [ROUND_SOURCE]: 1 };
  return accepted({
    environment: "production",
    runtimeSigner: pinned.signer,
    registryDomain: {
      chainId: pinned.chainId,
      verifyingContract: pinned.verifyingContract,
    },
    rpcEndpoints: Object.fromEntries(
      Object.keys(chains).map(source => [source, endpoints(2)]),
    ),
    entropyChainId: chains,
    minRpcQuorum: 2,
    tipLagMargin: Object.fromEntries(
      Object.keys(chains).map(source => [source, 2]),
    ),
  });
};

/** The configuration the vendored round passes under. */
export const roundConfig = (
  chains?: Readonly<Record<string, number>>,
): ChainConfig => configFor({ ...ROUND_DOMAIN, signer: ROUND_SIGNER }, chains);

export type Json = Record<string, unknown>;

const at = (parent: Json, key: string): Json => {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`fixture: ${key} is not an object`);
  }
  return value as Json;
};

/** The parts of a Snapshot input a test edits. */
export type RoundParts = {
  readonly input: Json;
  readonly proofs: Json;
  readonly randomnessProof: Json;
  readonly auth: Json;
  readonly newRound: Json;
  readonly fairnessProof: Json;
};

export const partsOf = (input: Json): RoundParts => {
  const proofs = at(input, "proofs");
  const auth = at(proofs, "createRoundAuth");
  return {
    input,
    proofs,
    randomnessProof: at(proofs, "randomnessProof"),
    auth,
    newRound: at(auth, "newRound"),
    fairnessProof: at(proofs, "fairnessProof"),
  };
};

/** The vendored `active` round with its `readyHash`, edited, then validated. */
export const vendoredRound = (
  edit?: (parts: RoundParts) => void,
): ValidSnapshot => {
  const input = vectorInput("valid", READY_VECTOR);
  edit?.(partsOf(input));
  return validated(input);
};

/** Makes an `active` round input `starting`: no step, no multiplier. */
export const asStarting = (parts: RoundParts): void => {
  parts.input["status"] = "starting";
  delete parts.input["step"];
  delete parts.input["currentMultiplier"];
};

/**
 * A registry key from a seeded source. Each call gets its own seed, given or
 * the default, so a test's key does not depend on how many keys other tests
 * drew before it.
 */
export const registryKey = (seed = 2): Signer =>
  createSigner({ random: recordingRandom(seed) });

export type IssuedRound = {
  readonly snapshot: ValidSnapshot;
  readonly config: ChainConfig;
  readonly created: Bytes32;
  /** `T_0` recomputed from what was issued. */
  readonly initial: Bytes32;
  readonly registry: Signer;
};

const text = (parent: Json, key: string): string => {
  const value = parent[key];
  if (typeof value !== "string") throw new TypeError(`fixture: ${key}`);
  return value;
};

const int = (parent: Json, key: string): number => {
  const value = parent[key];
  if (typeof value !== "number") throw new TypeError(`fixture: ${key}`);
  return value;
};

export type IssueOptions = {
  /** Applied before the round is signed: the change is signed. */
  readonly before?: (parts: RoundParts) => void;
  /** Applied after it is signed: the change is not signed. */
  readonly after?: (parts: RoundParts) => void;
  /** The entropy chain id per source the configuration pins. */
  readonly chains?: Readonly<Record<string, number>>;
  /** Signs with this key instead of the one the configuration pins. */
  readonly signWith?: Signer;
};

/**
 * The vendored round issued again by a seeded registry key: `before` edits it,
 * then its `randomnessTarget`, signature, signer, and `readyHash` are
 * recomputed as the backend would, then `after` edits it, and it is validated.
 * The configuration pins the key's address and the vendored domain.
 */
export const issueRound = (options: IssueOptions = {}): IssuedRound => {
  const registry = registryKey();
  const input = vectorInput("valid", READY_VECTOR);
  const parts = partsOf(input);
  options.before?.(parts);
  const { randomnessProof, auth, newRound, fairnessProof } = parts;
  const source = asciiBytes32(text(randomnessProof, "source"));
  const currency = asciiBytes32(text(newRound, "currency"));
  if (source === undefined || currency === undefined) {
    throw new TypeError("fixture: source or currency is not ASCII");
  }
  newRound["randomnessTarget"] = hashRandomnessTarget({
    source,
    entropyChainId: BigInt(int(auth, "entropyChainId")),
    blockNumber: BigInt(int(randomnessProof, "blockNumber")),
  });
  const created = hashNewRound({
    roundId: text(newRound, "roundId") as Bytes32,
    playerRef: text(newRound, "playerRef") as Bytes32,
    currency,
    betAmount: text(newRound, "betAmount"),
    gameId: int(newRound, "gameId"),
    gameVersion: int(newRound, "gameVersion"),
    circuitVersion: int(newRound, "circuitVersion"),
    roundSecretHash: text(newRound, "roundSecretHash") as Bytes32,
    randomnessTarget: text(newRound, "randomnessTarget") as Bytes32,
    actionKey: text(newRound, "actionKey") as Address,
    payoutTermsHash: text(newRound, "payoutTermsHash") as Bytes32,
  });
  const domain = at(auth, "domain");
  const digest = typedDataDigest(
    domainSeparator({
      name: REGISTRY_DOMAIN_NAME,
      version: REGISTRY_DOMAIN_VERSION,
      chainId: BigInt(int(domain, "chainId")),
      verifyingContract: text(domain, "verifyingContract") as Address,
    }),
    hashCreateRoundAuth({
      created,
      prepareWindow: int(auth, "prepareWindow"),
      expiry: text(auth, "expiry"),
    }),
  );
  auth["signature"] = (options.signWith ?? registry).sign(digest);
  auth["signer"] = registry.address.toLowerCase();
  const initial = hashReady({
    created,
    seedHash: text(fairnessProof, "seedHash") as Bytes32,
  });
  fairnessProof["readyHash"] = initial;
  options.after?.(parts);
  return {
    snapshot: validated(input),
    config: configFor(
      { ...ROUND_DOMAIN, signer: registry.address.toLowerCase() },
      options.chains,
    ),
    created,
    initial,
    registry,
  };
};
