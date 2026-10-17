// The problem branches of every operation, against the fake Play API built
// from the vendored document: each problem status the document lists for the
// operation, an unknown problem `code`, and the session-ending codes. The
// redeem and the cancel are never repeated; the token never reaches an error.

import { beforeEach, describe, expect, it } from "vitest";

import { shownForms } from "./fixtures/harness.ts";
import {
  CASES,
  LONG_WAIT_MS,
  PROBLEM_CASES,
  UNKNOWN_CODE,
} from "./fixtures/operation-cases.ts";
import {
  actionBody,
  FIXTURE_LAUNCH_CODE,
  idleSnapshot,
  redeemAnswer,
} from "./fixtures/play-bodies.ts";
import {
  createServerHarness,
  type ServerHarness,
} from "./fixtures/server-harness.ts";
import { FIXTURE_TOKEN } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import { cancelRound, redeemLaunchCode } from "./operations.ts";
import { ProblemError } from "./problem-error.ts";
import { endsSession } from "./problem.ts";

let h: ServerHarness;

beforeEach(() => {
  h = createServerHarness();
});

describe.each(PROBLEM_CASES)(
  "$id answered $status $code",
  ({ call, queueProblem, status, code }) => {
    it("throws a ProblemError with the document's status and code", async () => {
      queueProblem(h, status, code, false);
      const { error } = await h.settle(call(h), LONG_WAIT_MS);
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).problem).toMatchObject({ status, code });
      expect(h.server.served).toHaveLength(1);
    });
  },
);

describe.each(CASES)("$id", c => {
  it("keeps an unknown problem code and falls back on retryable", async () => {
    c.queueProblem(h, 503, UNKNOWN_CODE, true);
    c.queueProblem(h, 503, UNKNOWN_CODE, true);
    c.queueProblem(h, 503, UNKNOWN_CODE, true);
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).problem).toMatchObject({
      status: 503,
      code: UNKNOWN_CODE,
      retryable: true,
    });
    expect(endsSession((error as ProblemError).problem)).toBe(false);
    expect(h.server.served).toHaveLength(c.attempts);
  });

  it("does not repeat an unknown code that is not retryable", async () => {
    c.queueProblem(h, 500, UNKNOWN_CODE, false);
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    expect((error as ProblemError).problem.code).toBe(UNKNOWN_CODE);
    expect(h.server.served).toHaveLength(1);
  });

  it.each(["UNAUTHENTICATED", "SESSION_EXPIRED", "SESSION_REVOKED"])(
    "ends the session on %s and never repeats it",
    async code => {
      // Even when the problem claims to be retryable.
      c.queueProblem(h, 401, code, true);
      const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
      expect(endsSession((error as ProblemError).problem)).toBe(true);
      expect(h.server.served).toHaveLength(1);
    },
  );

  it("never shows the token or the launch code in an error", async () => {
    c.queueProblem(h, 401, "UNAUTHENTICATED", false);
    const { error } = await h.settle(c.call(h), LONG_WAIT_MS);
    for (const form of shownForms(error)) {
      expect(form).not.toContain(FIXTURE_TOKEN);
      expect(form).not.toContain(FIXTURE_LAUNCH_CODE);
    }
  });
});

describe("a repeated call (W-16)", () => {
  it.each(CASES.filter(c => c.attempts > 1))(
    "$id resends the same bytes",
    async c => {
      c.queueProblem(h, 503, "UNAVAILABLE", true);
      c.queueSuccess(h);
      await h.settle(c.call(h), LONG_WAIT_MS);
      expect(h.server.served).toHaveLength(2);
      expect(h.server.served[1]?.body).toEqual(h.server.served[0]?.body);
      expect(h.server.served[1]?.headers).toEqual(h.server.served[0]?.headers);
    },
  );
});

describe("the redeem (W-1, W-2)", () => {
  it("is not repeated after a retryable problem", async () => {
    h.server.answer(
      "redeemLaunchCode",
      { kind: "problem", status: 503, code: "UNAVAILABLE", retryable: true },
      { kind: "success", body: redeemAnswer },
    );
    const { error } = await h.settle(
      redeemLaunchCode(
        h.transport,
        { launchCode: FIXTURE_LAUNCH_CODE },
        { seal: h.seal },
      ),
      LONG_WAIT_MS,
    );
    expect(error).toBeInstanceOf(ProblemError);
    expect(h.server.served).toHaveLength(1);
  });
});

const cancel = (): Promise<unknown> =>
  cancelRound(h.transport, actionBody, h.auth);

describe("the cancel (W-25)", () => {
  it("is not repeated after a retryable UNAVAILABLE", async () => {
    h.server.answer(
      "cancelRound",
      { kind: "problem", status: 503, code: "UNAVAILABLE", retryable: true },
      { kind: "success", body: idleSnapshot },
    );
    const { error } = await h.settle(cancel(), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).problem).toMatchObject({
      status: 503,
      code: "UNAVAILABLE",
      retryable: true,
    });
    expect(h.server.served).toHaveLength(1);
  });

  it("is not repeated after a lost response", async () => {
    h.server.answer(
      "cancelRound",
      { kind: "network-failure" },
      { kind: "success", body: idleSnapshot },
    );
    const { error } = await h.settle(cancel(), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ reason: "network" });
    expect(h.server.served).toHaveLength(1);
  });

  it("is not repeated after an unknown retryable code", async () => {
    h.server.answer(
      "cancelRound",
      { kind: "problem", status: 503, code: UNKNOWN_CODE, retryable: true },
      { kind: "success", body: idleSnapshot },
    );
    const { error } = await h.settle(cancel(), LONG_WAIT_MS);
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).problem.code).toBe(UNKNOWN_CODE);
    expect(h.server.served).toHaveLength(1);
  });
});
