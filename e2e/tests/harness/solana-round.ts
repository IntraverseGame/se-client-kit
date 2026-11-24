import {
  type RoundPins,
  SOLANA_CLUSTER,
  SOLANA_SOURCE,
} from "./environment-config.ts";
import type { BodyCheck } from "./fake-play-wire.ts";
import { actionCheck, isSignature, ROUND, ROUND_PINS } from "./round-vector.ts";
import { typedDataBase64, validVector } from "./vectors.ts";

type Json = Readonly<Record<string, unknown>>;

export type SolanaRoundCase = "produced-slot" | "skipped-slot";

export type SolanaBaseVector =
  | "coinflip-active-ready-hash"
  | "coinflip-resolving-cancel";

type RoundSpec = {
  readonly vector: string;
  readonly readyHash: string;
};

const ROUND_SPECS: Readonly<Record<SolanaRoundCase, RoundSpec>> = {
  "produced-slot": {
    vector: "coinflip-won-solana",
    readyHash:
      "0x5d900ad791b5f499f41ec30c1f289ab53adad52a460770c7108be3d3c72e2fb8",
  },
  "skipped-slot": {
    vector: "coinflip-won-solana-skipped-slot",
    readyHash:
      "0xa70b58a5a5e5fde9b9b642cb591c89815ef93b857d6cbd39873f3332927f47f0",
  },
};

const CANCEL_VECTOR = "coinflip-cancel";
const PREVIOUS_HEX_LENGTH = 64;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const section = (parent: Json, key: string, where: string): Json => {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`${where}: no ${key}`);
  return value;
};

const text = (parent: Json, key: string, where: string): string => {
  const value = parent[key];
  if (typeof value !== "string") throw new Error(`${where}: no ${key}`);
  return value;
};

const number = (parent: Json, key: string, where: string): number => {
  const value = parent[key];
  if (typeof value !== "number") throw new Error(`${where}: no ${key}`);
  return value;
};

const issued = (round: SolanaRoundCase): Json =>
  validVector(ROUND_SPECS[round].vector, "Snapshot").input;

export const solanaRoundFacts = (
  round: SolanaRoundCase,
): {
  readonly roundId: string;
  readonly actionKey: string;
  readonly blockNumber: bigint;
  readonly readyHash: string;
} => {
  const { vector, readyHash } = ROUND_SPECS[round];
  const input = issued(round);
  const proofs = section(input, "proofs", vector);
  const auth = section(proofs, "createRoundAuth", vector);
  return {
    roundId: text(input, "roundId", vector),
    actionKey: text(
      section(auth, "newRound", vector),
      "actionKey",
      vector,
    ).toLowerCase(),
    blockNumber: BigInt(
      number(section(proofs, "randomnessProof", vector), "blockNumber", vector),
    ),
    readyHash,
  };
};

export const solanaPins = (): RoundPins => {
  const { vector } = ROUND_SPECS["produced-slot"];
  const auth = section(
    section(issued("produced-slot"), "proofs", vector),
    "createRoundAuth",
    vector,
  );
  const domain = section(auth, "domain", vector);
  return {
    signer: text(auth, "signer", vector),
    domain: {
      chainId: number(domain, "chainId", vector),
      verifyingContract: text(domain, "verifyingContract", vector),
    },
    source: SOLANA_SOURCE,
    entropyChainId: SOLANA_CLUSTER,
  };
};

export const solanaRound = (
  round: SolanaRoundCase,
  base: SolanaBaseVector,
): Json => {
  const { vector, readyHash } = ROUND_SPECS[round];
  const input = issued(round);
  const issuedProofs = section(input, "proofs", vector);
  const issuedRandomness = section(issuedProofs, "randomnessProof", vector);
  const template = validVector(base, "Snapshot").input;
  const proofs = section(template, "proofs", base);
  return {
    ...template,
    roundId: text(input, "roundId", vector),
    proofs: {
      ...proofs,
      randomnessProof: {
        ...section(proofs, "randomnessProof", base),
        source: text(issuedRandomness, "source", vector),
        blockNumber: number(issuedRandomness, "blockNumber", vector),
      },
      createRoundAuth: section(issuedProofs, "createRoundAuth", vector),
      fairnessProof: {
        ...section(proofs, "fairnessProof", base),
        readyHash,
      },
    },
  };
};

const cancelTypedData = (previous: string): string => {
  const hex = Buffer.from(typedDataBase64(CANCEL_VECTOR), "base64").toString(
    "hex",
  );
  return Buffer.from(
    `${hex.slice(0, -PREVIOUS_HEX_LENGTH)}${previous.slice(2)}`,
    "hex",
  ).toString("base64");
};

export const solanaCancelCheck = (round: SolanaRoundCase): BodyCheck => {
  const { roundId, readyHash } = solanaRoundFacts(round);
  return actionCheck(
    "the cancel",
    roundId,
    cancelTypedData(readyHash),
    isSignature,
  );
};

const mismatches = (round: SolanaRoundCase): readonly string[] => {
  const facts = solanaRoundFacts(round);
  const pins = solanaPins();
  const checks: readonly (readonly [string, boolean])[] = [
    ["actionKey", facts.actionKey === ROUND.actionKey],
    ["signer", pins.signer === ROUND_PINS.signer],
    [
      "domain",
      JSON.stringify(pins.domain) === JSON.stringify(ROUND_PINS.domain),
    ],
  ];
  return checks.filter(([, same]) => !same).map(([name]) => name);
};

for (const round of ["produced-slot", "skipped-slot"] as const) {
  const different = mismatches(round);
  if (different.length > 0) {
    throw new Error(
      `${ROUND_SPECS[round].vector} differs from the round tests' round in ${different.join(", ")}`,
    );
  }
}
