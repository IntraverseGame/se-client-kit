import { beforeEach, describe, expect, it } from "vitest";

import { json } from "./fixtures/fake-play-api.ts";
import {
  authorized,
  createHarness,
  statusOf,
  type Harness,
} from "./fixtures/harness.ts";
import {
  insufficientFunds,
  sessionExpired,
  sessionRevoked,
  unauthenticated,
  unavailable,
} from "./fixtures/problems.ts";
import { START_MS, longToken } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import { ProblemError } from "./problem-error.ts";
import { endsSession } from "./problem.ts";
import { DEFAULT_RETRY_CONFIG } from "./retry.ts";

let h: Harness;

beforeEach(() => {
  h = createHarness();
});

const LONG_WAIT_MS =
  DEFAULT_RETRY_CONFIG.maxDelayMs * DEFAULT_RETRY_CONFIG.maxAttempts;
const redeem = {
  method: "POST",
  path: "/sessions",
  body: { launchCode: "c" },
  retry: "never",
} as const;

describe("the redeem is never repeated (W-1, W-2)", () => {
  it("when its response was lost", async () => {
    h.api.reply({ kind: "network-failure" }, json(200, longToken));
    const { error } = await h.settle(h.transport.send(redeem), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(NetworkError);
    expect(h.api.requests).toHaveLength(1);
  });

  it("when it timed out", async () => {
    h.api.reply({ kind: "hang" }, json(200, longToken));
    const { error } = await h.settle(
      h.transport.send(redeem),
      LONG_WAIT_MS * 10,
    );
    expect(error).toMatchObject({ reason: "timeout" });
    expect(h.api.requests).toHaveLength(1);
  });

  it("when it is answered with a retryable problem", async () => {
    h.api.reply(json(statusOf(unavailable), unavailable), json(200, longToken));
    const { error } = await h.settle(h.transport.send(redeem), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).problem.retryable).toBe(true);
    expect(h.api.requests).toHaveLength(1);
  });
});

describe("retryable problems and lost responses (W-16, W-42, W-43)", () => {
  it("repeats a retryable problem with the same bytes, after the backoff", async () => {
    h.api.reply(
      json(statusOf(unavailable), unavailable),
      json(200, { done: true }),
    );
    const pending = h.transport.send({
      method: "POST",
      path: "/rounds/r/continue",
      body: {
        idempotencyKey: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
        signed: "0xab",
      },
      retry: "idempotent",
    });
    await h.clock.advance(DEFAULT_RETRY_CONFIG.initialDelayMs - 1);
    expect(h.api.requests).toHaveLength(1);
    const { value } = await h.settle(pending, 1);
    expect(value?.body).toEqual({ done: true });
    expect(h.api.requests).toHaveLength(2);
    expect(h.request(1).init.body).toBe(h.request(0).init.body);
  });

  it("repeats a lost response of an idempotent call", async () => {
    h.api.reply({ kind: "network-failure" }, json(200, { done: true }));
    const { value } = await h.settle(
      h.transport.send({
        method: "GET",
        path: "/snapshot",
        retry: "idempotent",
      }),
      DEFAULT_RETRY_CONFIG.initialDelayMs,
    );
    expect(value?.status).toBe(200);
    expect(h.api.requests).toHaveLength(2);
  });

  it("does not repeat a problem that is not retryable", async () => {
    h.api.reply(
      json(statusOf(insufficientFunds), insufficientFunds),
      json(200, {}),
    );
    const { error } = await h.settle(
      h.transport.send({ method: "POST", path: "/start", retry: "idempotent" }),
      LONG_WAIT_MS,
    );
    expect(error).toBeInstanceOf(ProblemError);
    expect(h.api.requests).toHaveLength(1);
  });

  it("gives up after the bounded number of attempts", async () => {
    const failures = Array.from(
      { length: DEFAULT_RETRY_CONFIG.maxAttempts + 1 },
      () => ({
        kind: "network-failure" as const,
      }),
    );
    h.api.reply(...failures);
    const { error } = await h.settle(
      h.transport.send({
        method: "GET",
        path: "/snapshot",
        retry: "idempotent",
      }),
      LONG_WAIT_MS,
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect(h.api.requests).toHaveLength(DEFAULT_RETRY_CONFIG.maxAttempts);
  });
});

describe("the session-ending codes (W-7)", () => {
  it.each([sessionExpired, sessionRevoked, unauthenticated])(
    "$code ends the session and is never repeated",
    async body => {
      // Even when a malformed problem claims to be retryable.
      h.api.reply(
        json(statusOf(body), { ...body, retryable: true }),
        json(200, {}),
      );
      const { error } = await h.settle(
        h.transport.send(
          authorized({ method: "POST", path: "/x", retry: "idempotent" }),
        ),
        LONG_WAIT_MS,
      );
      expect(error).toBeInstanceOf(ProblemError);
      expect(endsSession((error as ProblemError).problem)).toBe(true);
      expect(h.api.requests).toHaveLength(1);
    },
  );
});

describe("the refresh (W-6, W-7)", () => {
  it("repeats a lost response with the same old token", async () => {
    h.api.reply({ kind: "network-failure" }, json(200, longToken));
    const { value } = await h.settle(
      h.transport.send(
        authorized({
          method: "POST",
          path: "/sessions/s1/refresh",
          retry: "refresh",
          notAfterMs: START_MS + LONG_WAIT_MS,
        }),
      ),
      DEFAULT_RETRY_CONFIG.initialDelayMs,
    );
    expect(value?.body).toEqual(longToken);
    expect(h.api.requests).toHaveLength(2);
    expect(h.request(1).init.headers).toEqual(h.request(0).init.headers);
  });

  it("stops repeating at the old token's deadline", async () => {
    h.api.reply({ kind: "network-failure" }, json(200, longToken));
    const { error } = await h.settle(
      h.transport.send(
        authorized({
          method: "POST",
          path: "/sessions/s1/refresh",
          retry: "refresh",
          notAfterMs: START_MS + DEFAULT_RETRY_CONFIG.initialDelayMs,
        }),
      ),
      LONG_WAIT_MS,
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect(h.api.requests).toHaveLength(1);
  });
});
