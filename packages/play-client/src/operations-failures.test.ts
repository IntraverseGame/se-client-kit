// The failures without a problem of every operation, against the fake Play
// API built from the vendored document: a lost response, a timeout, a body
// that is not JSON, and an answer that does not match the document.

import { beforeEach, describe, expect, it } from "vitest";

import { shownForms } from "./fixtures/harness.ts";
import {
  CASES,
  LONG_WAIT_MS,
  TIMEOUT_WAIT_MS,
} from "./fixtures/operation-cases.ts";
import {
  FIXTURE_LAUNCH_CODE,
  FIXTURE_NEW_TOKEN,
  redeemAnswer,
  refreshAnswer,
} from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import { FIXTURE_TOKEN, START_MS } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import { redeemLaunchCode, refreshPlayToken } from "./operations.ts";
import { ProtocolError } from "./protocol-error.ts";
import { DEFAULT_RETRY_CONFIG } from "./retry.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

describe.each(CASES)("$id", c => {
  it("throws a NetworkError when every response is lost", async () => {
    c.queue(
      h,
      { kind: "network-failure" },
      { kind: "network-failure" },
      { kind: "network-failure" },
    );
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ reason: "network" });
    expect(h.server.served).toHaveLength(c.attempts);
  });

  it("times out an answer that never comes", async () => {
    c.queue(h, { kind: "hang" }, { kind: "hang" }, { kind: "hang" });
    const { error } = await h.settle(c.call(h), TIMEOUT_WAIT_MS * c.attempts);
    expect(error).toMatchObject({ reason: "timeout" });
    expect(h.server.served).toHaveLength(c.attempts);
  });

  it("ends with an aborted NetworkError when the caller aborts", async () => {
    c.queue(h, { kind: "hang" }, { kind: "hang" }, { kind: "hang" });
    const pending = h.settle(c.call(h));
    h.cancel.abort();
    const { error } = await pending;
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ reason: "aborted" });
    expect(h.server.served).toHaveLength(1);
  });

  it("throws a ProtocolError on an error status without a problem body", async () => {
    c.queue(h, { kind: "garbage", status: 502 });
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProtocolError);
    expect(h.server.served).toHaveLength(1);
  });

  it("throws a ProtocolError on a success body that is not JSON", async () => {
    c.queue(h, { kind: "garbage", status: 200 });
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProtocolError);
  });

  it("repeats a lost response only when its retry class allows", async () => {
    c.queue(h, { kind: "network-failure" });
    c.queueSuccess(h);
    const outcome = await h.settle(c.call(h), LONG_WAIT_MS);
    expect(h.server.served).toHaveLength(Math.min(2, c.attempts));
    expect(outcome.error === undefined).toBe(c.attempts > 1);
  });
});

describe("an answer that does not match the document", () => {
  it.each([
    ["no sessionId", { ...redeemAnswer, sessionId: undefined }],
    ["a malformed sessionId", { ...redeemAnswer, sessionId: "ses_X" }],
    ["an empty playToken", { ...redeemAnswer, playToken: "" }],
    [
      "a deadline without a zone",
      { ...redeemAnswer, tokenExpiresAt: "2026-10-16T12:15:00" },
    ],
    ["no sessionExpiresAt", { ...redeemAnswer, sessionExpiresAt: undefined }],
    ["no gameOrigin", { ...redeemAnswer, gameOrigin: undefined }],
    ["an empty gameOrigin", { ...redeemAnswer, gameOrigin: "" }],
    [
      "a gameOrigin of 268 characters",
      { ...redeemAnswer, gameOrigin: `https://${"a".repeat(260)}` },
    ],
    [
      "a gameOrigin of 268 code points outside the BMP",
      { ...redeemAnswer, gameOrigin: "\u{1F3B2}".repeat(268) },
    ],
    ["a numeric gameOrigin", { ...redeemAnswer, gameOrigin: 1 }],
    ["an empty gamePath", { ...redeemAnswer, gamePath: "" }],
    ["a relative gamePath", { ...redeemAnswer, gamePath: "coin-flip/" }],
    ["a gamePath without a trailing /", { ...redeemAnswer, gamePath: "/a" }],
    ["a gamePath with //", { ...redeemAnswer, gamePath: "/a//b/" }],
    ["a gamePath with ..", { ...redeemAnswer, gamePath: "/a/../" }],
    ["a gamePath with .", { ...redeemAnswer, gamePath: "/./" }],
    ["a gamePath with a query", { ...redeemAnswer, gamePath: "/a?b/" }],
    ["a gamePath with %", { ...redeemAnswer, gamePath: "/a%2F/" }],
    [
      "a gamePath with a host",
      { ...redeemAnswer, gamePath: "//evil.example/" },
    ],
    [
      "a gamePath of 257 characters",
      { ...redeemAnswer, gamePath: `/${"a/".repeat(128)}` },
    ],
    ["a numeric gamePath", { ...redeemAnswer, gamePath: 1 }],
  ])("refuses a redeem answer with %s", async (_name, body) => {
    h.server.answer("redeemLaunchCode", {
      kind: "success",
      body: body as unknown as typeof redeemAnswer,
    });
    const { error } = await h.settle(
      redeemLaunchCode(
        h.transport,
        { launchCode: FIXTURE_LAUNCH_CODE },
        { seal: h.seal },
      ),
    );
    expect(error).toBeInstanceOf(ProtocolError);
    for (const form of shownForms(error)) {
      expect(form).not.toContain(FIXTURE_TOKEN);
    }
  });

  it.each([
    ["an array", [refreshAnswer]],
    ["no playToken", { tokenExpiresAt: refreshAnswer.tokenExpiresAt }],
    ["a numeric deadline", { ...refreshAnswer, tokenExpiresAt: START_MS }],
  ])("refuses a refresh answer that is %s", async (_name, body) => {
    h.server.answer("refreshPlayToken", {
      kind: "success",
      body: body as unknown as typeof refreshAnswer,
    });
    const { error } = await h.settle(
      refreshPlayToken(h.transport, {
        ...h.auth,
        seal: h.seal,
        notAfterMs: START_MS + 1,
      }),
    );
    expect(error).toBeInstanceOf(ProtocolError);
    for (const form of shownForms(error)) {
      expect(form).not.toContain(FIXTURE_NEW_TOKEN);
    }
  });
});

describe("the refresh deadline (W-7)", () => {
  it("does not repeat a refresh at or after the old token's deadline", async () => {
    h.server.answer(
      "refreshPlayToken",
      { kind: "network-failure" },
      { kind: "success", body: refreshAnswer },
    );
    const { error } = await h.settle(
      refreshPlayToken(h.transport, {
        ...h.auth,
        seal: h.seal,
        notAfterMs: START_MS + DEFAULT_RETRY_CONFIG.initialDelayMs,
      }),
      LONG_WAIT_MS,
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect(h.server.served).toHaveLength(1);
  });
});
