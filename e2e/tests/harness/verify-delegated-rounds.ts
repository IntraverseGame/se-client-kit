// The canned rounds of VT-16's browser rows (V-22): the matching round of
// `verify-rounds.ts` started with a key delegation. The vendored `valid/`
// Snapshot vector `coinflip-active-key-delegation` is the same round (the same
// signed `newRound`, whose action key the delegation names), so its
// `proofs.keyDelegation` is the body's `keyDelegation` as it is. It is read
// through `contracts`' test-only entry at run time, never copied into a file.

import { validVector } from "./vectors.ts";
import { matchingRound } from "./verify-rounds.ts";

type Json = Record<string, unknown>;

const DELEGATION_VECTOR = "coinflip-active-key-delegation";

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A deep, mutable copy of the vector's `proofs.keyDelegation`. */
export const vectorDelegation = (): Json => {
  const input: unknown = JSON.parse(
    JSON.stringify(validVector(DELEGATION_VECTOR, "Snapshot").input),
  );
  const proofs = isRecord(input) ? input["proofs"] : undefined;
  const delegation = isRecord(proofs) ? proofs["keyDelegation"] : undefined;
  if (!isRecord(delegation)) {
    throw new Error(`${DELEGATION_VECTOR}: no proofs.keyDelegation`);
  }
  return delegation;
};

/** The matching round, started with the vector's key delegation. */
export const delegatedRound = (): Json => ({
  ...matchingRound(),
  keyDelegation: vectorDelegation(),
});

/**
 * The delegated round with `acceptedAt` at the expiry, so check 9's item 4 (the
 * expiry is after `acceptedAt`) fails and every other check matches.
 */
export const tamperedDelegatedRound = (): Json => {
  const delegation = vectorDelegation();
  return {
    ...matchingRound(),
    keyDelegation: { ...delegation, acceptedAt: delegation["expiry"] },
  };
};
