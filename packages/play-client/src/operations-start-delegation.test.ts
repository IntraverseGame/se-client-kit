// T-43: the start's wallet delegation (RFC-006, slice S4; W-22, W-70, W-71).
// `startRound` sends `keyDelegation` as the caller built it, byte for byte, and
// a start without one has no such field; a repeat sends the same bytes, the
// delegation included; the three `KEY_DELEGATION_*` codes and a `409`
// `CONFLICT` are `ProblemError`s, each sent once.

import { beforeEach, describe, expect, it } from "vitest";

import { LONG_WAIT_MS } from "./fixtures/operation-cases.ts";
import {
  delegatedStartBody,
  keyDelegation,
  startBody,
  startingSnapshot,
} from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import { startRound } from "./operations.ts";
import { ProblemError } from "./problem-error.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

const KEY_DELEGATION_CODES = [
  "KEY_DELEGATION_INVALID",
  "KEY_DELEGATION_EXPIRED",
  "KEY_DELEGATION_NOTICE_UNKNOWN",
] as const;

const success = { kind: "success", body: startingSnapshot } as const;

const delegatedStart = (): Promise<unknown> =>
  startRound(h.transport, delegatedStartBody, h.auth);

describe("startRound with a wallet delegation (T-43)", () => {
  it("sends keyDelegation byte for byte, unread and unnormalized", async () => {
    h.server.answer("startRound", success);
    await h.settle(delegatedStart());
    const [sent] = h.server.served;
    expect(sent?.rawBody).toBe(JSON.stringify(delegatedStartBody));
    // The placeholder's mixed case reaches the server as given.
    expect(sent?.body).toMatchObject({ keyDelegation });
  });

  it("sends no keyDelegation field for a start without one", async () => {
    h.server.answer("startRound", success);
    await h.settle(startRound(h.transport, startBody, h.auth));
    const [sent] = h.server.served;
    expect(sent?.rawBody).toBe(JSON.stringify(startBody));
    expect(sent?.rawBody).not.toContain("keyDelegation");
    expect(sent?.body).not.toHaveProperty("keyDelegation");
  });

  it.each([
    ["a lost response", { kind: "network-failure" } as const],
    [
      "a retryable UNAVAILABLE",
      {
        kind: "problem",
        status: 503,
        code: "UNAVAILABLE",
        retryable: true,
      } as const,
    ],
  ])(
    "repeats the same bytes, the delegation included, after %s",
    async (_name, failure) => {
      h.server.answer("startRound", failure, success);
      const { error } = await h.settle(delegatedStart(), LONG_WAIT_MS);
      expect(error).toBeUndefined();
      const [first, second] = h.server.served;
      expect(h.server.served).toHaveLength(2);
      expect(first?.rawBody).toBe(JSON.stringify(delegatedStartBody));
      expect(second?.rawBody).toBe(first?.rawBody);
    },
  );

  describe.each(KEY_DELEGATION_CODES)("a 422 %s", code => {
    it.each([false, true])(
      "is a ProblemError with its code, sent once (retryable: %s)",
      async retryable => {
        h.server.answer(
          "startRound",
          { kind: "problem", status: 422, code, retryable },
          success,
        );
        const { error } = await h.settle(delegatedStart(), LONG_WAIT_MS);
        expect(error).toBeInstanceOf(ProblemError);
        expect((error as ProblemError).problem).toMatchObject({
          status: 422,
          code,
          retryable,
        });
        expect(h.server.served).toHaveLength(1);
      },
    );
  });

  it.each([false, true])(
    "surfaces a 409 CONFLICT as a ProblemError, sent once (retryable: %s)",
    async retryable => {
      h.server.answer(
        "startRound",
        { kind: "problem", status: 409, code: "CONFLICT", retryable },
        success,
      );
      const { error } = await h.settle(delegatedStart(), LONG_WAIT_MS);
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).problem).toMatchObject({
        status: 409,
        code: "CONFLICT",
        retryable,
      });
      expect(h.server.served).toHaveLength(1);
    },
  );
});
