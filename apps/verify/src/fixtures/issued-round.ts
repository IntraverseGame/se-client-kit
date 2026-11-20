// Test-only: the vendored `coinflip-active-ready-hash` round issued again for
// another entropy source and chain (a `solana` source on cluster 101, staging's
// `anvil`), so a test has a round whose checks 1 to 5 hold for a source the
// vectors are not signed for. Its `randomnessTarget`, signature, signer, and
// `readyHash` are recomputed as the backend would, by a registry key drawn
// from a seeded random source, whose address the configuration then pins. No
// key is written down: it is drawn at run time and stays in its signer. The
// page cannot import the shell's fixtures (D-2), so this follows the shell's
// `issueRound` (`packages/shell/src/fixtures/round-auth.ts`).

import {
  type Address,
  type Bytes32,
  createSigner,
  domainSeparator,
  hashCreateRoundAuth,
  hashNewRound,
  hashRandomnessTarget,
  hashReady,
  type RandomSource,
  type Signer,
  typedDataDigest,
} from "@intraverse/se-client-signing";

import { asciiBytes32 } from "../ascii-bytes32.ts";
import { hashFromBytes } from "../hex.ts";
import { at, type Pinned, validSnapshot } from "./rounds.ts";

type Json = Record<string, unknown>;

/** Mulberry32 bytes: a seeded source, so a failing case replays. */
const seededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return length => Uint8Array.from({ length }, () => next() & 0xff);
};

/** A registry key drawn from a seeded source. */
export const registryKey = (seed = 2): Signer =>
  createSigner({ random: seededRandom(seed) });

/** The registry domain the vendored round is signed under. */
const DOMAIN = {
  chainId: 31337,
  verifyingContract: "0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e",
} as const;

/** What a configuration pins for rounds `registry` issues. */
export const pinnedFor = (registry: Signer): Pinned => ({
  ...DOMAIN,
  signer: registry.address.toLowerCase() as `0x${string}`,
});

/** The reveals an ended round carries (any 32 bytes do: check 7 is not run). */
export const ROUND_SECRET = `0x${"33".repeat(32)}` as const;
export const SEED = `0x${"44".repeat(32)}` as const;

const sha256 = async (hex: string): Promise<Bytes32> => {
  const bytes = Uint8Array.from(
    hex
      .slice(2)
      .match(/../gu)
      ?.map(pair => Number.parseInt(pair, 16)) ?? [],
  );
  return hashFromBytes(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ) as Bytes32;
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
  /** The Snapshot `source` the round is signed for. */
  readonly source: string;
  /** The entropy chain id (a cluster number for `solana`) it is signed for. */
  readonly entropyChainId: number;
  readonly status: string;
  /** Adds the reveals (`ROUND_SECRET`, `SEED`) and their commitments. */
  readonly reveals: boolean;
  readonly registry: Signer;
};

/** The vendored round, issued again for `source` on `entropyChainId`. */
export const issuedSnapshot = async (options: IssueOptions): Promise<Json> => {
  const snapshot = validSnapshot("coinflip-active-ready-hash");
  snapshot["status"] = options.status;
  const randomness = at(snapshot, "proofs.randomnessProof");
  const fairness = at(snapshot, "proofs.fairnessProof");
  const auth = at(snapshot, "proofs.createRoundAuth");
  const newRound = at(auth, "newRound");
  randomness["source"] = options.source;
  auth["entropyChainId"] = options.entropyChainId;
  if (options.reveals) {
    const roundSecretHash = await sha256(ROUND_SECRET);
    randomness["roundSecretHash"] = roundSecretHash;
    newRound["roundSecretHash"] = roundSecretHash;
    randomness["roundSecret"] = ROUND_SECRET;
    fairness["seedHash"] = await sha256(SEED);
    fairness["seed"] = SEED;
  }
  const source = asciiBytes32(options.source);
  const currency = asciiBytes32(text(newRound, "currency"));
  if (source === undefined || currency === undefined) {
    throw new TypeError("fixture: source or currency is not ASCII");
  }
  newRound["randomnessTarget"] = hashRandomnessTarget({
    source,
    entropyChainId: BigInt(options.entropyChainId),
    blockNumber: BigInt(int(randomness, "blockNumber")),
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
  auth["signature"] = options.registry.sign(
    typedDataDigest(
      domainSeparator({
        name: text(domain, "name"),
        version: text(domain, "version"),
        chainId: BigInt(int(domain, "chainId")),
        verifyingContract: text(domain, "verifyingContract") as Address,
      }),
      hashCreateRoundAuth({
        created,
        prepareWindow: int(auth, "prepareWindow"),
        expiry: text(auth, "expiry"),
      }),
    ),
  );
  auth["signer"] = options.registry.address.toLowerCase();
  fairness["readyHash"] = hashReady({
    created,
    seedHash: text(fairness, "seedHash") as Bytes32,
  });
  return snapshot;
};
