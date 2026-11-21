// The vendored `key-delegation/v1` accepted vector, read at run time from the
// `contracts` test-only entry (no value is copied into a file): the request
// the Wrapper would send for it, and the typed data and signature the wallet
// is asked for and gives.

import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";

import type { SigningRequest } from "../protocol.ts";

export type AcceptedVector = {
  readonly request: SigningRequest;
  /** The vector's `typedData`, as `eth_signTypedData_v4` takes it. */
  readonly typedData: unknown;
  /** The wallet's address, as the vector writes it. */
  readonly wallet: string;
  readonly signature: string;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordAt = (
  value: unknown,
  where: string,
): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) throw new TypeError(`${where} is not an object`);
  return value;
};

const stringAt = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string => {
  const value = record[key];
  if (typeof value !== "string") throw new TypeError(`${key} is not a string`);
  return value;
};

/** The accepted vector, checked for the fields the tests use. */
export const acceptedVector = (): AcceptedVector => {
  const file = recordAt(keyDelegationVectors.v1, "the vectors");
  const list = file["accepted"];
  if (!Array.isArray(list)) throw new TypeError("accepted is not a list");
  const accepted = recordAt(list[0], "accepted[0]");
  const start = recordAt(accepted["start"], "start");
  const delegation = recordAt(accepted["keyDelegation"], "keyDelegation");
  const expiry = delegation["expiry"];
  if (typeof expiry !== "number") throw new TypeError("expiry is not a number");
  return {
    request: {
      actionKey: stringAt(start, "actionKey"),
      sessionId: stringAt(start, "sessionId"),
      expiry,
      noticeId: stringAt(accepted, "noticeId"),
    },
    typedData: accepted["typedData"],
    wallet: stringAt(delegation, "wallet"),
    signature: stringAt(delegation, "signature"),
  };
};
