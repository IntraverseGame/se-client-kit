import { describe, expect, it } from "vitest";

import { SERVER_AHEAD_DATE, START_MS } from "./fixtures/session.ts";
import { newIntent } from "./idempotency.ts";
import { endsSession, readProblem } from "./problem.ts";
import { DEFAULT_RETRY_CONFIG, backoffDelayMs } from "./retry.ts";
import { clockOffsetMs, singleFlight } from "./token-schedule.ts";

describe("clockOffsetMs", () => {
  it("is the server time minus the local receive time", () => {
    expect(clockOffsetMs(SERVER_AHEAD_DATE, START_MS)).toBe(
      Date.parse(SERVER_AHEAD_DATE) - START_MS,
    );
  });

  it("is undefined for a missing or invalid header", () => {
    for (const header of [null, undefined, "", "  ", "not a date"]) {
      expect(clockOffsetMs(header, START_MS)).toBeUndefined();
    }
  });
});

describe("singleFlight (W-6)", () => {
  it("runs one task at a time and shares its result", async () => {
    const finishers: ((value: string) => void)[] = [];
    const refresh = singleFlight(
      () =>
        new Promise<string>(resolve => {
          finishers.push(resolve);
        }),
    );
    const first = refresh();
    const second = refresh();
    expect(second).toBe(first);
    expect(finishers).toHaveLength(1);
    finishers[0]?.("done");
    await expect(first).resolves.toBe("done");
    const third = refresh();
    expect(third).not.toBe(first);
    expect(finishers).toHaveLength(2);
    finishers[1]?.("again");
    await expect(third).resolves.toBe("again");
  });

  it("starts a new run after a failure", async () => {
    const outcomes = [Promise.reject(new Error("lost")), Promise.resolve(2)];
    outcomes[0]?.catch(() => {});
    const task = singleFlight(() => Promise.resolve(outcomes.shift()));
    await expect(task()).rejects.toThrow("lost");
    await expect(task()).resolves.toBe(2);
  });
});

describe("newIntent (W-36)", () => {
  it("draws one key from the injected random source", () => {
    const keys = [
      "0192F3A4-5B6C-7D8E-9F01-23456789ABCD",
      "0192f3a4-5b6c-7d8e-9f01-23456789abce",
    ];
    const random = (): string => String(keys.shift());
    expect(newIntent(random)).toEqual({
      idempotencyKey: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
    });
    expect(newIntent(random)).toEqual({
      idempotencyKey: "0192f3a4-5b6c-7d8e-9f01-23456789abce",
    });
  });

  it("refuses a source that does not return a UUID", () => {
    expect(() => newIntent(() => "1234")).toThrow(TypeError);
  });
});

describe("readProblem", () => {
  it("reads the routing fields of a problem", () => {
    expect(
      readProblem(
        {
          type: "about:blank",
          title: "t",
          status: 409,
          code: "STALE_ACTION",
          retryable: false,
          requestId: "r1",
        },
        409,
      ),
    ).toEqual({
      status: 409,
      code: "STALE_ACTION",
      retryable: false,
      requestId: "r1",
    });
  });

  it("keeps a code this kit does not know, for the status and retryable fallback", () => {
    expect(readProblem({ code: "NEW_CODE", retryable: true }, 503)).toEqual({
      status: 503,
      code: "NEW_CODE",
      retryable: true,
    });
  });

  it("is undefined for a body that is not a problem or a status that is not an error", () => {
    for (const body of [
      undefined,
      null,
      "x",
      [],
      {},
      { code: "", retryable: false },
      { code: "X" },
      { code: 1, retryable: false },
    ]) {
      expect(readProblem(body, 400)).toBeUndefined();
    }
    expect(readProblem({ code: "X", retryable: false }, 200)).toBeUndefined();
  });

  it("ends the session only for the session-ending codes", () => {
    expect(
      endsSession({ status: 401, code: "UNAUTHENTICATED", retryable: false }),
    ).toBe(true);
    expect(
      endsSession({ status: 409, code: "STALE_ACTION", retryable: false }),
    ).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  it("doubles from the initial delay up to the maximum", () => {
    const delays = [1, 2, 3, 4].map(attempt =>
      backoffDelayMs(DEFAULT_RETRY_CONFIG, attempt),
    );
    expect(delays).toEqual([500, 1_000, 2_000, 2_000]);
  });
});
