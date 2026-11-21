// The vendored `key-delegation/v1` vectors the fake Play API's tests send
// (T-43): the accepted vector's `keyDelegation`, a start body's field as the
// backend takes it, and the codes the backend answers the refused vectors
// with. Read at run time from the `contracts` test-only entry; no value is
// copied into a file.

import type { ErrorCode } from "@intraverse/se-client-contracts";
import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";

/** The start body's `keyDelegation`, in the Play API document's form. */
export type KeyDelegationBody = {
  readonly wallet: string;
  readonly expiry: number;
  readonly noticeHash: string;
  readonly signature: string;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordAt = (
  value: unknown,
  where: string,
): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    throw new TypeError(`key-delegation/v1: ${where} is not an object`);
  }
  return value;
};

const listAt = (value: unknown, where: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`key-delegation/v1: ${where} is not a list`);
  }
  return value;
};

const stringAt = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  where: string,
): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError(`key-delegation/v1: ${where}.${key} is not a string`);
  }
  return value;
};

const vectors = (): Readonly<Record<string, unknown>> =>
  recordAt(keyDelegationVectors.v1, "the file");

/** The accepted vector's `keyDelegation`, as a delegated start sends it. */
export const acceptedKeyDelegation = (): KeyDelegationBody => {
  const [accepted] = listAt(vectors()["accepted"], "accepted");
  const body = recordAt(
    recordAt(accepted, "accepted[0]")["keyDelegation"],
    "accepted[0].keyDelegation",
  );
  const expiry = body["expiry"];
  if (typeof expiry !== "number" || !Number.isSafeInteger(expiry)) {
    throw new TypeError(
      "key-delegation/v1: accepted[0].keyDelegation.expiry is not an integer",
    );
  }
  const where = "accepted[0].keyDelegation";
  return {
    wallet: stringAt(body, "wallet", where),
    expiry,
    noticeHash: stringAt(body, "noticeHash", where),
    signature: stringAt(body, "signature", where),
  };
};

const REFUSAL_CODES: readonly ErrorCode[] = [
  "KEY_DELEGATION_INVALID",
  "KEY_DELEGATION_EXPIRED",
  "KEY_DELEGATION_NOTICE_UNKNOWN",
];

const isRefusalCode = (code: string): code is ErrorCode =>
  (REFUSAL_CODES as readonly string[]).includes(code);

/** The distinct codes of the refused vectors, in their first order. */
export const refusalCodes = (): readonly ErrorCode[] => {
  const codes = listAt(vectors()["refused"], "refused").map((entry, index) =>
    stringAt(recordAt(entry, `refused[${String(index)}]`), "code", "refused"),
  );
  const unknown = codes.filter(code => !isRefusalCode(code));
  if (unknown.length > 0) {
    throw new Error(`key-delegation/v1: unknown codes ${unknown.join(", ")}`);
  }
  return [...new Set(codes.filter(code => isRefusalCode(code)))];
};
