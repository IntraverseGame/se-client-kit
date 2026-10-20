// The canned rounds the fake verify API serves, all built at run time from the vendored `valid/` Snapshot
// vector `coinflip-active-ready-hash` (the round the round tests play), the
// body shape A-1 assumes (the Snapshot's fields plus an optional
// `kernelVersion`). Nothing is copied into a file: the vector is read through
// `contracts`' test-only entry, and a tampered round is a change of one field
// of a deep copy.
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

/** The object at a dotted path of `root`, for a change in place. */
const at = (root: Json, path: string): Json =>
  path.split(".").reduce<Json>((node, key) => {
    const next = node[key];
    if (!isRecord(next)) throw new Error(`${ROUND_VECTOR}: no ${path}`);
    return next;
  }, root);

/** A hash that is not the one in the evidence: every digit changed. */
const other = (hash: string): string =>
  `0x${hash
    .slice(2)
    .replaceAll(/[0-9a-f]/giu, digit => (digit === "0" ? "1" : "0"))}`;

/** The vendored round, as the verify API would give it after a cancel. */
export const matchingRound = (): Json => ({ ...copy(), status: "canceled" });

/** The vendored round as it is: `active`, not ended (V-8). */
export const notEndedRound = (): Json => copy();

/** The matching round under a kernel version the page does not know (V-8). */
export const unknownKernelRound = (): Json => ({
  ...matchingRound(),
  kernelVersion: 2,
});

/** The checks a canned round can fail on its own. */
export type TamperedCheck = 2 | 3 | 4 | 5 | 6;

/**
 * The matching round with one field changed, so the check that recomputes it
 * fails: check 2 by another `blockNumber` (the target no longer matches), check
 * 3 by another `prepareWindow` (the signature signs another digest), check 4 by
 * another `readyHash`, check 5 by both reveals (`roundSecret`, `seed`), neither
 * hashing to its commitment, check 6 by a `blockValue` that is not block N's
 * hash. Check 1 is not a field: serve this round under another round id.
 */
export const tamperedRound = (check: TamperedCheck): Json => {
  const round = matchingRound();
  const randomness = at(round, "proofs.randomnessProof");
  if (check === 2) {
    randomness["blockNumber"] = Number(ROUND.blockNumber) + 1;
  } else if (check === 3) {
    const auth = at(round, "proofs.createRoundAuth");
    auth["prepareWindow"] = Number(auth["prepareWindow"]) + 1;
  } else if (check === 4) {
    const fairness = at(round, "proofs.fairnessProof");
    fairness["readyHash"] = other(String(fairness["readyHash"]));
  } else if (check === 5) {
    // Both reveals, so the page compares the commitments (one reveal would
    // only be "a reveal is missing"): each is another value than its
    // commitment's preimage, so the hashes differ.
    const fairness = at(round, "proofs.fairnessProof");
    randomness["roundSecret"] = other(String(randomness["roundSecretHash"]));
    fairness["seed"] = other(String(fairness["seedHash"]));
  } else {
    randomness["blockValue"] = `0x${"ab".repeat(32)}`;
  }
  return round;
};
