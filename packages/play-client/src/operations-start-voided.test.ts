// A start voided or refused before any money moved is answered once (W-16,
// W-36, W-42): the Play API document says to retry such a start with a new
// key, so the transport never repeats it with the same one, whatever its
// `retryable`. `UNAVAILABLE`, and a lost response, are repeated as before.

import { beforeEach, describe, expect, it } from "vitest";

import {
  CASES,
  LONG_WAIT_MS,
  UNKNOWN_CODE,
} from "./fixtures/operation-cases.ts";
import {
  createServerHarness,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import { ProblemError } from "./problem-error.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

const start = CASES.find(c => c.id === "startRound");
if (start === undefined) {
  throw new Error("the case table has no startRound");
}

const VOIDED_START_CODES = [
  "FUNDING_UNCONFIRMED",
  "ENTROPY_UNAVAILABLE",
  "PREPARATION_TIMEOUT",
  "ROUND_VOIDED",
] as const;

describe("startRound and a voided start", () => {
  it.each(VOIDED_START_CODES)(
    "sends the start once when %s says retryable: true",
    async code => {
      start.queueProblem(h, 503, code, true);
      start.queueSuccess(h);
      const { error } = await h.settle(start.call(h), LONG_WAIT_MS);
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).problem).toMatchObject({
        status: 503,
        code,
        retryable: true,
      });
      expect(h.server.served).toHaveLength(1);
    },
  );

  it("sends the start once for a code it does not know, though retryable", async () => {
    start.queueProblem(h, 503, UNKNOWN_CODE, true);
    start.queueSuccess(h);
    const { error } = await h.settle(start.call(h), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProblemError);
    expect(h.server.served).toHaveLength(1);
  });

  it("still repeats UNAVAILABLE with the same bytes", async () => {
    start.queueProblem(h, 503, "UNAVAILABLE", true);
    start.queueSuccess(h);
    const { error } = await h.settle(start.call(h), LONG_WAIT_MS);
    expect(error).toBeUndefined();
    expect(h.server.served).toHaveLength(2);
    expect(h.server.served[1]?.body).toEqual(h.server.served[0]?.body);
  });

  it("still repeats a lost response", async () => {
    start.queue(h, { kind: "network-failure" });
    start.queueSuccess(h);
    const { error } = await h.settle(start.call(h), LONG_WAIT_MS);
    expect(error).toBeUndefined();
    expect(h.server.served).toHaveLength(2);
  });
});
