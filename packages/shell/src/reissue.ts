// W-26's re-issue: a later read of the round whose `proofs.createRoundAuth`
// differs, field by field after validation, from the first one the shell
// received for the round (whether or not that one passed).

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { CreateRoundAuthProof } from "./create-round-auth.ts";

const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const left = a as Readonly<Record<string, unknown>>;
  const right = b as Readonly<Record<string, unknown>>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      key => Object.hasOwn(right, key) && sameJson(left[key], right[key]),
    )
  );
};

/**
 * W-26's re-issue: a later read of the round whose `proofs.createRoundAuth`
 * differs, field by field after validation, from the first one the shell
 * received for the round (whether or not that one passed). A later read without
 * the object is not a re-issue; the checks' `missing` rule covers it.
 */
export const isReissue = (
  first: CreateRoundAuthProof,
  snapshot: ValidSnapshot,
): boolean => {
  const later = snapshot.proofs?.createRoundAuth;
  return later !== undefined && !sameJson(first, later);
};
