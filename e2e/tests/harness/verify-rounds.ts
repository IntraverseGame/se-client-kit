// The canned rounds the fake verify API serves, all built at run time from the
// vendored `valid/` Snapshot vector `coinflip-active-ready-hash` (the round the
// round tests play), written as the verify API document's `RoundVerification`
// body (`verifyBody`; no vendored vector is a verify API body). Nothing is
// copied into a file: the vector is read through `contracts`' test-only entry,
// and a tampered round is a change of one field of a deep copy.
//
// The matching round is that vector's round as `canceled`, without reveals:
// checks 1 to 4 and 6 are recomputed and match (the fake RPC endpoints give
// block N's hash), checks 5 and 7 are "not checked" (V-12, V-13). A `won` or
// `lost` round that matches cannot be built from the vendored vectors: its
// `roundSecretHash` is signed into `newRound`, so a reveal that hashes to it
// needs a round the backend signed with that reveal (an open question in the
// spec's test plan, not guessed here).

import type { RoundPins } from "./environment-config.ts";
import { ROUND, ROUND_PINS, ROUND_VECTOR } from "./round-vector.ts";
import { validVector } from "./vectors.ts";

type Json = Record<string, unknown>;

/** The round id the canned rounds are for, in its canonical (UUID) form. */
export const VERIFY_ROUND_ID = ROUND.roundId;

/** A second well-formed round id (UUIDv7) no canned round is for. */
export const UNKNOWN_ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0e";

/** What the verify page's configuration pins: the same as the round tests'. */
export const VERIFY_PINS: RoundPins = ROUND_PINS;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A deep, mutable copy of the vendored round. */
const copy = (): Json => {
  const copied: unknown = JSON.parse(
    JSON.stringify(validVector(ROUND_VECTOR, "Snapshot").input),
  );
  if (!isRecord(copied)) throw new Error(`${ROUND_VECTOR}: not an object`);
  return copied;
};

const field = (root: Json, key: string): Json => {
  const next = root[key];
  if (!isRecord(next)) throw new Error(`${ROUND_VECTOR}: no ${key}`);
  return next;
};

const word = (hex: string): string => hex.replace(/^0x/u, "").padStart(64, "0");
const ascii = (text: string): string =>
  [...text]
    .map(c => (c.codePointAt(0) ?? 0).toString(16).padStart(2, "0"))
    .join("");

/** `abi.encode(NewRound)` of the Snapshot's `newRound`, as the API writes it. */
const encodeNewRound = (n: Json): string =>
  `0x${[
    word(String(n["roundId"])),
    word(String(n["playerRef"])),
    ascii(String(n["currency"])).padEnd(64, "0"),
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
 * The Snapshot as the verify API's `RoundVerification` body. The vendored round
 * has no pick and no payout, so the replay has no steps and the body has no
 * payout. `reveal` is written only when the Snapshot carries a secret.
 */
const verifyBody = (snapshot: Json): Json => {
  const proofs = field(snapshot, "proofs");
  const randomness = field(proofs, "randomnessProof");
  const fairness = field(proofs, "fairnessProof");
  const auth = field(proofs, "createRoundAuth");
  const domain = field(auth, "domain");
  const steps = field(snapshot, "config")["steps"] as readonly Json[];
  const status = String(snapshot["status"]);
  return {
    roundId: snapshot["roundId"],
    status,
    closed: status === "canceled",
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
        nodes: steps.map(step => ({
          options: step["optionCount"],
          losers: 1,
          next: [],
        })),
        houseEdgeWad: "20000000000000000",
        maxMultiplierMilli: 2000,
      },
    },
    shape: [],
    bet: { amount: "100", currency: "EUR", decimals: 2 },
    commitment: {
      roundSecretHash: randomness["roundSecretHash"],
      createRoundAuth: {
        newRound: encodeNewRound(field(auth, "newRound")),
        prepareWindow: auth["prepareWindow"],
        expiryUnix: Number(auth["expiry"]),
        signature: auth["signature"],
      },
      registryChainId: domain["chainId"],
      registryAddress: domain["verifyingContract"],
      adminSigner: auth["signer"],
    },
    entropy: {
      source: randomness["source"],
      chainId: auth["entropyChainId"],
      block: randomness["blockNumber"],
      ...(randomness["blockValue"] === undefined
        ? {}
        : { value: randomness["blockValue"] }),
    },
    seedHash: fairness["seedHash"],
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
    ...(status === "canceled"
      ? { recomputed: { kind: "none", steps: [] } }
      : {}),
    checks: [],
  };
};

/** A hash that is not the one in the evidence: every digit changed. */
const other = (hash: string): string =>
  `0x${hash
    .slice(2)
    .replaceAll(/[0-9a-f]/giu, digit => (digit === "0" ? "1" : "0"))}`;

/** The vendored round, as the verify API would give it after a cancel. */
export const matchingRound = (): Json =>
  verifyBody({ ...copy(), status: "canceled" });

/** The vendored round as it is: `active`, not ended (V-8). */
export const notEndedRound = (): Json => verifyBody(copy());

/**
 * The vendored round as the API shows a voided one (V-8): `idle` with a
 * `voidReason`, closed, with no replay.
 */
export const voidedRound = (): Json => {
  const { recomputed: _replay, ...round } = matchingRound();
  return {
    ...round,
    status: "idle",
    closed: true,
    voidReason: "ENTROPY_TIMEOUT",
  };
};

/** A round refused before any money moved: `idle` with a `rejectCode`. */
export const refusedRound = (): Json => {
  const { voidReason: _void, ...round } = voidedRound();
  return { ...round, rejectCode: "INSUFFICIENT_FUNDS" };
};

/** The matching round under a kernel version the page does not know (V-8). */
export const unknownKernelRound = (): Json => {
  const round = matchingRound();
  return { ...round, kernel: { ...field(round, "kernel"), version: 2 } };
};

/**
 * The matching round for a game of one step with three options, so it is not
 * the one shape the page recomputes (A-3): `game.terms.nodes` has one node of
 * three options. The `shape` stays empty, as the matching round's does.
 */
export const unsupportedShapeRound = (): Json => {
  const round = matchingRound();
  const nodes = field(field(round, "game"), "terms")["nodes"] as Json[];
  for (const node of nodes) node["options"] = 3;
  return round;
};

/** The checks a canned round can fail on its own. */
export type TamperedCheck = 2 | 3 | 4 | 5 | 6;

/**
 * The matching round with one field changed, so the check that recomputes it
 * fails: check 2 by another `entropy.block` (the target no longer matches),
 * check 3 by another `prepareWindow` (the signature signs another digest),
 * check 4 by another `readyHash`, check 5 by both reveals (`reveal.roundSecret`
 * and `reveal.seed`), neither hashing to its commitment, check 6 by an
 * `entropy.value` that is not block N's hash. Check 1 is not a field: serve
 * this round under another round id.
 */
export const tamperedRound = (check: TamperedCheck): Json => {
  const round = matchingRound();
  const entropy = field(round, "entropy");
  if (check === 2) {
    entropy["block"] = Number(ROUND.blockNumber) + 1;
  } else if (check === 3) {
    const auth = field(field(round, "commitment"), "createRoundAuth");
    auth["prepareWindow"] = Number(auth["prepareWindow"]) + 1;
  } else if (check === 4) {
    round["readyHash"] = other(String(round["readyHash"]));
  } else if (check === 5) {
    // Both reveals, so the page compares the commitments (one reveal would
    // only be "a reveal is missing"): each is another value than its
    // commitment's preimage, so the hashes differ.
    round["reveal"] = {
      roundSecret: other(String(field(round, "commitment")["roundSecretHash"])),
      seed: other(String(round["seedHash"])),
    };
  } else {
    entropy["value"] = `0x${"ab".repeat(32)}`;
  }
  return round;
};
