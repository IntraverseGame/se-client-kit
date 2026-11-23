// T-44's message rules of `se.delegation/1` (W-67): a message is read only
// through the own data properties of a plain object with exactly its type's
// fields, each of its type and shape; anything else is not a message.

import { describe, expect, it } from "vitest";

import {
  DELEGATION_SCHEMA,
  isDelegationReady,
  readDelegationAnswer,
} from "./delegation-protocol.ts";

const WALLET = `0x${"7a".repeat(20)}`;
const SIGNATURE = `0x${"ab".repeat(64)}1b`;
const RESULT = {
  schema: DELEGATION_SCHEMA,
  type: "result",
  wallet: WALLET,
  signature: SIGNATURE,
};

describe("ready", () => {
  it("is exactly the schema and the type", () => {
    expect(
      isDelegationReady({ schema: DELEGATION_SCHEMA, type: "ready" }),
    ).toBe(true);
  });

  it.each<[string, unknown]>([
    ["another schema", { schema: "se.delegation/2", type: "ready" }],
    ["another type", { schema: DELEGATION_SCHEMA, type: "request" }],
    ["an extra field", { schema: DELEGATION_SCHEMA, type: "ready", x: 1 }],
    ["a missing field", { type: "ready" }],
    [
      "a JSON text",
      JSON.stringify({ schema: DELEGATION_SCHEMA, type: "ready" }),
    ],
    ["an array", [DELEGATION_SCHEMA, "ready"]],
    ["null", null],
    [
      "an accessor",
      Object.defineProperty({ schema: DELEGATION_SCHEMA }, "type", {
        get: () => "ready",
        enumerable: true,
      }),
    ],
    [
      "a class instance",
      new (class {
        public readonly schema = DELEGATION_SCHEMA;
        public readonly type = "ready";
      })(),
    ],
  ])("is not %s", (_name, data) => {
    expect(isDelegationReady(data)).toBe(false);
  });
});

describe("result and failed", () => {
  it("reads a result, either case", () => {
    const upper = {
      ...RESULT,
      signature: SIGNATURE.toUpperCase().replace("0X", "0x"),
    };
    expect(readDelegationAnswer(RESULT)).toEqual(RESULT);
    expect(readDelegationAnswer(upper)).toEqual(upper);
  });

  it.each([
    "no-wallet",
    "rejected",
    "unknown-notice",
    "invalid-request",
    "wallet-error",
  ])("reads failed with %s", reason => {
    const failed = { schema: DELEGATION_SCHEMA, type: "failed", reason };
    expect(readDelegationAnswer(failed)).toEqual(failed);
  });

  it.each<[string, unknown]>([
    ["a zero wallet", { ...RESULT, wallet: `0x${"00".repeat(20)}` }],
    ["a short wallet", { ...RESULT, wallet: `0x${"7a".repeat(19)}` }],
    ["a wallet without 0x", { ...RESULT, wallet: "7a".repeat(20) }],
    ["a short signature", { ...RESULT, signature: `0x${"ab".repeat(64)}` }],
    [
      "a signature that is not hex",
      { ...RESULT, signature: `0x${"zz".repeat(65)}` },
    ],
    ["a number signature", { ...RESULT, signature: 1 }],
    ["an extra field", { ...RESULT, sessionId: "ses_x" }],
    [
      "a missing field",
      { schema: DELEGATION_SCHEMA, type: "result", wallet: WALLET },
    ],
    ["another schema", { ...RESULT, schema: "se.operator/1" }],
    ["a ready", { schema: DELEGATION_SCHEMA, type: "ready" }],
    ["a request", { schema: DELEGATION_SCHEMA, type: "request" }],
    [
      "a reason off the list",
      { schema: DELEGATION_SCHEMA, type: "failed", reason: "other" },
    ],
    [
      "a failed with an extra field",
      {
        schema: DELEGATION_SCHEMA,
        type: "failed",
        reason: "rejected",
        detail: "x",
      },
    ],
    ["a JSON text", JSON.stringify(RESULT)],
    ["an array", [RESULT]],
  ])("ignores %s", (_name, data) => {
    expect(readDelegationAnswer(data)).toBeUndefined();
  });
});
