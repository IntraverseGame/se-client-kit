// Test-only: edits of a round Snapshot and the small helpers the W-26 check
// tests share.

import type { Bytes32 } from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import {
  type AuthCheck,
  checkCreateRoundAuth,
  type CreateRoundAuthProof,
  type StartRequest,
} from "../create-round-auth.ts";
import {
  issueRound,
  type IssueOptions,
  type Json,
  partsOf,
  ROUND_REQUEST,
  type RoundParts,
} from "./round-auth.ts";
import { validated } from "./vectors.ts";

/** A copy of a validated round Snapshot, edited, then validated again. */
export const reread = (
  snapshot: ValidSnapshot,
  edit: (parts: RoundParts) => void,
): ValidSnapshot => {
  const input = structuredClone(snapshot) as unknown as Json;
  edit(partsOf(input));
  return validated(input);
};

/**
 * A copy of a round Snapshot with `edit` applied and NOT validated: for a check
 * that must fail closed on a document the validator would refuse.
 */
export const unvalidated = (
  snapshot: ValidSnapshot,
  edit: (parts: RoundParts) => void,
): ValidSnapshot => {
  const input = structuredClone(snapshot) as unknown as Json;
  edit(partsOf(input));
  return input as unknown as ValidSnapshot;
};

/** A round Snapshot's `proofs.createRoundAuth`, or a thrown error. */
export const authOf = (snapshot: ValidSnapshot): CreateRoundAuthProof => {
  const auth = snapshot.proofs?.createRoundAuth;
  if (auth === undefined) throw new TypeError("fixture: no createRoundAuth");
  return auth;
};

/** A 32-byte value no round uses. */
export const HASH: Bytes32 = `0x${"ab".repeat(32)}`;

/** A refusal with `reason`, as the checks return it. */
export const refused = (
  reason: string,
): { readonly status: "refused"; readonly reason: string } => ({
  status: "refused",
  reason,
});

const ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * The same signature with `s` replaced by `n - s` and `v` flipped: it recovers
 * the same key, but is not canonical (W-21).
 */
export const highS = (signature: unknown): string => {
  if (typeof signature !== "string") throw new TypeError("fixture: signature");
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = signature.slice(130) === "1b" ? "1c" : "1b";
  return `${signature.slice(0, 66)}${(ORDER - s).toString(16).padStart(64, "0")}${v}`;
};

/** The `created` of checks that passed, or a thrown error. */
export const createdOf = (check: AuthCheck): Bytes32 => {
  if (check.status !== "passed") {
    throw new TypeError(`fixture: the checks are ${check.status}`);
  }
  return check.created;
};

/** Checks 1 to 4 on a round issued with `options`, against what it pins. */
export const checked = (
  options: IssueOptions = {},
  request: StartRequest = ROUND_REQUEST,
): AuthCheck => {
  const round = issueRound(options);
  return checkCreateRoundAuth(round.config, request, round.snapshot);
};
