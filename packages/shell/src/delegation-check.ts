// W-72's delegation check, one input of a round's verdict beside the tip check
// (round-verification.ts): the round's `proofs.keyDelegation` is the
// delegation the shell sent with the start, compared by value, or absent when
// it sent none. Hex values are compared as the bytes they decode to (`sameHex`:
// the backend echoes them in lowercase, and `wallet` carries no checksum), the
// expiry as an integer, the notice's id and text exactly; `domain` is fixed by
// the schema and `acceptedAt` is not compared. It decides; it signs nothing.

import {
  type Address,
  type Bytes32,
  sameHex,
  type Signature,
} from "@intraverse/se-client-signing";
import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

import type { DelegationFailure } from "./delegation-types.ts";
import { sameJson } from "./reissue.ts";

/** A validated Snapshot's `proofs.keyDelegation` (W-72). */
export type CarriedDelegation = NonNullable<
  NonNullable<ValidSnapshot["proofs"]>["keyDelegation"]
>;

/** The delegation a start carried, with what its evidence must name. */
export type ExpectedDelegation = {
  readonly wallet: Address;
  /** The shell's own action key's address. */
  readonly actionKey: Address;
  /** `sessionIdBytes32` of the redeem's `sessionId`. */
  readonly sessionId: Bytes32;
  /** Unix seconds: a time, never an amount. */
  readonly expiry: number;
  readonly noticeId: string;
  readonly noticeHash: Bytes32;
  readonly notice: string;
  readonly signature: Signature;
};

export type DelegationCheck = {
  /** Reads a validated Snapshot of the round (the caller filters others). */
  readonly observe: (snapshot: ValidSnapshot) => void;
  /** The failure, once one is known; it never clears. */
  readonly failure: () => DelegationFailure | undefined;
  /** Each distinct `proofs.keyDelegation` read for the round, in order. */
  readonly evidence: () => readonly CarriedDelegation[];
};

/** Whether `carried` names exactly the delegation the shell sent. */
export const sameDelegation = (
  expected: ExpectedDelegation,
  carried: CarriedDelegation,
): boolean =>
  sameHex(carried.wallet, expected.wallet) &&
  sameHex(carried.actionKey, expected.actionKey) &&
  sameHex(carried.sessionId, expected.sessionId) &&
  Number.isSafeInteger(carried.expiry) &&
  carried.expiry === expected.expiry &&
  carried.noticeId === expected.noticeId &&
  sameHex(carried.noticeHash, expected.noticeHash) &&
  carried.notice === expected.notice &&
  sameHex(carried.signature, expected.signature);

/**
 * The check of one round, for the delegation its start carried (`undefined`
 * when it carried none).
 */
export const createDelegationCheck = (
  expected: ExpectedDelegation | undefined,
): DelegationCheck => {
  const read: CarriedDelegation[] = [];
  let first: CarriedDelegation | undefined;
  let failure: DelegationFailure | undefined;
  // A read past `starting` carried no object before any arrived.
  let judged = false;

  const observe = (snapshot: ValidSnapshot): void => {
    const carried = snapshot.proofs?.keyDelegation;
    if (carried === undefined) {
      // Judged once the round is past `starting`, as check 1 is; a later read
      // without the object, after one was received, is not a change.
      if (first === undefined && snapshot.status !== "starting") {
        judged = true;
        if (expected !== undefined) failure ??= "missing";
      }
      return;
    }
    if (!read.some(known => sameJson(known, carried))) read.push(carried);
    if (first === undefined) {
      first = carried;
      if (expected === undefined) {
        // On the first judged read it is unexpected; appearing after the
        // round was judged without one, it is a change (decided 2026-11-20).
        if (judged) failure = "changed";
        else failure ??= "unexpected";
      } else if (!sameDelegation(expected, carried)) failure ??= "mismatch";
      return;
    }
    // Whether or not the first passed, a different later one is a change.
    if (!sameJson(first, carried)) failure = "changed";
  };

  return Object.freeze({
    observe,
    failure: (): DelegationFailure | undefined => failure,
    evidence: (): readonly CarriedDelegation[] => Object.freeze([...read]),
  });
};
