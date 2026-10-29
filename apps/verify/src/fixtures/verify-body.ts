// Test-only: a vendored Snapshot vector's round written as the verify API's
// `RoundVerification` body (`verifyBody`). The vectors hold the signed values
// and no vendored vector is a verify API body, so the tests build one from the
// round, and change a field of a deep copy to test the page's reading of it.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import { asciiBytes32 } from "../ascii-bytes32.ts";

type Json = Record<string, unknown>;

const ENTROPY_CHAIN_ID = 1;

const ENDED = new Set(["won", "lost", "canceled"]);
const word = (hex: string): string => hex.replace(/^0x/u, "").padStart(64, "0");
export const asRecord = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};

/** `abi.encode(NewRound)` of a Snapshot's `newRound`, as the API writes it. */
const encodeNewRound = (n: Json): string =>
  `0x${[
    word(String(n["roundId"])),
    word(String(n["playerRef"])),
    word(asciiBytes32(String(n["currency"])) ?? "0x"),
    word(BigInt(String(n["betAmount"])).toString(16)),
    word(Number(n["gameId"]).toString(16)),
    word(Number(n["gameVersion"]).toString(16)),
    word(Number(n["circuitVersion"]).toString(16)),
    word(String(n["roundSecretHash"])),
    word(String(n["randomnessTarget"])),
    word(String(n["actionKey"])),
    word(String(n["payoutTermsHash"])),
  ].join("")}`;

/**
 * A Snapshot (a vector's round, or one a test changed) as the verify API's
 * `RoundVerification` body: the same round, in the document's fields. A field
 * the Snapshot lacks is lacking in the body.
 */
export const verifyBody = (snapshot: Json): Json => {
  const steps = (
    (asRecord(snapshot["config"])["steps"] ?? []) as readonly Json[]
  ).map(step => asRecord(step));
  const proofs = asRecord(snapshot["proofs"]);
  const randomness = asRecord(proofs["randomnessProof"]);
  const fairness = asRecord(proofs["fairnessProof"]);
  const auth =
    proofs["createRoundAuth"] === undefined
      ? undefined
      : asRecord(proofs["createRoundAuth"]);
  const newRound = asRecord(auth?.["newRound"]);
  const domain = asRecord(auth?.["domain"]);
  const payout =
    snapshot["payout"] === undefined ? undefined : asRecord(snapshot["payout"]);
  const played: Json[] = [];
  for (const [node, step] of steps.entries()) {
    if (step["selectedIndex"] === undefined) break;
    played.push({
      node,
      option: step["selectedIndex"],
      losers: step["losingIndex"] === undefined ? [] : [step["losingIndex"]],
      survived: step["selectedIndex"] !== step["losingIndex"],
    });
  }
  const status = String(snapshot["status"]);
  return {
    roundId: snapshot["roundId"],
    status,
    ...(snapshot["closeReason"] === undefined
      ? {}
      : { closeReason: snapshot["closeReason"] }),
    closed: ENDED.has(status),
    kernel: {
      name: "the SuperEngine fairness kernel",
      version: snapshot["kernelVersion"] ?? 1,
      vectorSets: [],
    },
    game: {
      gameCode: "coin-flip",
      gameId: 1,
      gameVersion: 1,
      packageHash: `0x${"11".repeat(32)}`,
      terms: {
        nodes: steps.map((step, i) => ({
          options: step["optionCount"],
          losers: 1,
          next: i + 1 < steps.length ? [i + 1] : [],
        })),
        houseEdgeWad: "30000000000000000",
        maxMultiplierMilli: 4_294_967_295,
      },
    },
    shape: [],
    bet: { amount: "100", currency: "EUR", decimals: 2 },
    ...(payout === undefined
      ? {}
      : {
          payout: {
            amount: payout["value"],
            currency: payout["unit"],
            decimals: 2,
          },
        }),
    ...(auth === undefined && randomness["roundSecretHash"] === undefined
      ? {}
      : {
          commitment: {
            ...(randomness["roundSecretHash"] === undefined
              ? {}
              : { roundSecretHash: randomness["roundSecretHash"] }),
            ...(auth === undefined
              ? {}
              : {
                  createRoundAuth: {
                    newRound: encodeNewRound(newRound),
                    prepareWindow: auth["prepareWindow"],
                    expiryUnix: Number(auth["expiry"]),
                    signature: auth["signature"],
                  },
                  registryChainId: domain["chainId"],
                  registryAddress: domain["verifyingContract"],
                  adminSigner: auth["signer"],
                }),
          },
        }),
    ...(randomness["source"] === undefined
      ? {}
      : {
          entropy: {
            source: randomness["source"],
            chainId: auth?.["entropyChainId"] ?? ENTROPY_CHAIN_ID,
            block: randomness["blockNumber"],
            ...(randomness["blockValue"] === undefined
              ? {}
              : { value: randomness["blockValue"] }),
          },
        }),
    ...(fairness["seedHash"] === undefined
      ? {}
      : { seedHash: fairness["seedHash"] }),
    ...(fairness["readyHash"] === undefined
      ? {}
      : { readyHash: fairness["readyHash"] }),
    ...(randomness["roundSecret"] === undefined
      ? {}
      : {
          reveal: {
            roundSecret: randomness["roundSecret"],
            ...(fairness["seed"] === undefined
              ? {}
              : { seed: fairness["seed"] }),
          },
        }),
    actions: [],
    ...(ENDED.has(status)
      ? {
          recomputed: {
            kind: status === "canceled" ? "none" : status,
            steps: played,
          },
        }
      : {}),
    checks: [],
  };
};

const inputOf = (name: string): Json => {
  const vector = snapshotVectors.valid[name] as { input: Json } | undefined;
  if (vector === undefined) throw new TypeError(`no vector ${name}`);
  return structuredClone(vector.input);
};

/** A won Coin Flip round with its proofs and a payout, as the API's body. */
export const wonBody = (): Json =>
  structuredClone(
    verifyBody({
      ...inputOf("coinflip-won-proofs-verified"),
      payout: inputOf("coinflip-won-payout")["payout"],
    }),
  );

/** The object at the parent of `path` (dotted) in `copy`, and the last key. */
const parentOf = (copy: Json, path: string): [Json, string] => {
  const keys = path.split(".");
  let target: Json = copy;
  for (const key of keys.slice(0, -1)) target = target[key] as Json;
  return [target, keys.at(-1) ?? ""];
};

/** A copy of the won body with `path` (dotted) set to `value`. */
export const withField = (path: string, value: unknown): Json => {
  const copy = wonBody();
  const [target, last] = parentOf(copy, path);
  target[last] = value;
  return copy;
};

/** A copy of the won body without `path` (dotted). */
export const withoutField = (path: string): Json => {
  const copy = wonBody();
  const [target, last] = parentOf(copy, path);
  Reflect.deleteProperty(target, last);
  return copy;
};
