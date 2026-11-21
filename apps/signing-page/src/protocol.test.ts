// T-47: the page's side of `se.delegation/1` (W-67, SP-6): a message that is
// not a well-formed `request` is not read (it is ignored, never answered); a
// well-formed one whose values break W-67's shapes, or whose expiry a `Date`
// cannot hold (SP-6), is `invalid-request`; the
// page's own messages have exactly W-67's fields.

import { describe, expect, it } from "vitest";

import { formatExpiry } from "./messages.ts";
import {
  failedMessage,
  MAX_EXPIRY_SECONDS,
  readRequest,
  readyMessage,
  resultMessage,
} from "./protocol.ts";

const REQUEST = {
  schema: "se.delegation/1",
  type: "request",
  actionKey: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  sessionId: `ses_${"0123456789abcdef".repeat(2)}`,
  expiry: 1_795_000_000,
  noticeId: "en-draft-1",
} as const;

describe("readRequest (W-67's message rules)", () => {
  it("reads a well-formed request", () => {
    expect(readRequest(REQUEST)).toEqual({
      kind: "request",
      request: {
        actionKey: REQUEST.actionKey,
        sessionId: REQUEST.sessionId,
        expiry: REQUEST.expiry,
        noticeId: REQUEST.noticeId,
      },
    });
  });

  it.each([
    ["another schema", { ...REQUEST, schema: "se.delegation/2" }],
    ["another type", { ...REQUEST, type: "ready" }],
    ["a result", { schema: "se.delegation/1", type: "result" }],
    ["an extra field", { ...REQUEST, notice: "text" }],
    [
      "a missing field",
      Object.fromEntries(
        Object.entries(REQUEST).filter(([key]) => key !== "noticeId"),
      ),
    ],
    ["a field set to undefined", { ...REQUEST, noticeId: undefined }],
    ["expiry as a string", { ...REQUEST, expiry: "1795000000" }],
    ["actionKey as a number", { ...REQUEST, actionKey: 1 }],
    ["a string", JSON.stringify(REQUEST)],
    ["an array", [REQUEST]],
    ["null", null],
    [
      "a class instance",
      Object.assign(
        new (class Message {
          readonly kind = "message";
        })(),
        REQUEST,
      ),
    ],
  ])("does not read %s", (_name, data: unknown) => {
    expect(readRequest(data)).toBeUndefined();
  });

  it("does not read a getter, and never runs it", () => {
    let ran = false;
    const data = { ...REQUEST };
    Object.defineProperty(data, "noticeId", {
      enumerable: true,
      get: () => {
        ran = true;
        return "en-draft-1";
      },
    });
    expect(readRequest(data)).toBeUndefined();
    expect(ran).toBe(false);
  });

  it.each([
    ["an actionKey short of 40 hex digits", { actionKey: "0x1234" }],
    ["the zero address", { actionKey: `0x${"0".repeat(40)}` }],
    ["a sessionId in uppercase", { sessionId: `ses_${"A".repeat(32)}` }],
    ["a sessionId off its pattern", { sessionId: "ses_1" }],
    ["an expiry of 0", { expiry: 0 }],
    ["a fractional expiry", { expiry: 1.5 }],
    ["an expiry past 2^53 - 1", { expiry: Number.MAX_SAFE_INTEGER + 1 }],
    ["an expiry a Date cannot hold", { expiry: MAX_EXPIRY_SECONDS + 1 }],
    ["the largest safe integer expiry", { expiry: Number.MAX_SAFE_INTEGER }],
    ["a noticeId in uppercase", { noticeId: "EN-DRAFT-1" }],
    ["a noticeId longer than 64", { noticeId: "a".repeat(65) }],
  ])("reads %s as invalid", (_name, change) => {
    expect(readRequest({ ...REQUEST, ...change })).toEqual({ kind: "invalid" });
  });

  it("reads the latest expiry a Date can hold, and it formats without throwing", () => {
    const reading = readRequest({ ...REQUEST, expiry: MAX_EXPIRY_SECONDS });
    expect(reading).toMatchObject({
      kind: "request",
      request: { expiry: MAX_EXPIRY_SECONDS },
    });
    expect(() => formatExpiry(MAX_EXPIRY_SECONDS)).not.toThrow();
    expect(() => formatExpiry(MAX_EXPIRY_SECONDS + 1)).toThrow(RangeError);
  });
});

describe("the page's messages", () => {
  it("are exactly W-67's", () => {
    expect(readyMessage()).toEqual({
      schema: "se.delegation/1",
      type: "ready",
    });
    expect(resultMessage("0xab", "0xcd")).toEqual({
      schema: "se.delegation/1",
      type: "result",
      wallet: "0xab",
      signature: "0xcd",
    });
    expect(failedMessage("no-wallet")).toEqual({
      schema: "se.delegation/1",
      type: "failed",
      reason: "no-wallet",
    });
  });
});
