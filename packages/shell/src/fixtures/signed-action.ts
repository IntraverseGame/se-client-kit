// Test-only: the vendored `signed-action/` Snapshot vectors of the Coin Flip
// cancel and the Cash or Crash cash-out (an independent signer's
// `PlayerCancel` and `PlayerCashOut`), read through the
// `contracts` test-only entry and narrowed to what the shell's tests compare:
// the message, its struct hash and digest, and the typedData. The test key is
// not read: `signing`'s tests sign with it.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import type { Bytes32 } from "@intraverse/se-client-signing";

import { hex, record, text } from "./vectors.ts";

export type SignedActionVector = {
  readonly round: Bytes32;
  readonly previous: Bytes32;
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
  readonly typedDataBase64: string;
};

/** The `signed-action/` vector `name`, read and checked. */
const signedActionVector = (name: string): SignedActionVector => {
  const vectors: Readonly<Record<string, unknown>> =
    snapshotVectors.signedAction;
  const vector = record(vectors[name], name);
  const eip712 = record(vector["eip712"], `${name}.eip712`);
  const message = record(eip712["message"], `${name}.message`);
  const typedData = record(vector["typedData"], `${name}.typedData`);
  return {
    round: hex(message, "round", `${name}.message`),
    previous: hex(message, "previous", `${name}.message`),
    structHash: hex(vector, "structHash", name),
    digest: hex(vector, "digest", name),
    typedDataBase64: text(typedData, "base64", `${name}.typedData`),
  };
};

/** The `signed-action/coinflip-cancel` vector, read and checked. */
export const coinflipCancelVector = (): SignedActionVector =>
  signedActionVector("coinflip-cancel");

/** The `signed-action/cashorcrash-cash-out` vector, read and checked. */
export const cashOrCrashCashOutVector = (): SignedActionVector =>
  signedActionVector("cashorcrash-cash-out");
