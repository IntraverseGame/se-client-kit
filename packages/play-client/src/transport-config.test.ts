import { describe, expect, it } from "vitest";

import { createFakeClock } from "./fixtures/fake-clock.ts";
import { createFakePlayApi } from "./fixtures/fake-play-api.ts";
import { BASE_URL, START_MS } from "./fixtures/session.ts";
import { DEFAULT_RETRY_CONFIG, type RetryConfig } from "./retry.ts";
import { createTransport, type TransportOptions } from "./transport.ts";

const base = (): TransportOptions => ({
  baseUrl: BASE_URL,
  fetch: createFakePlayApi().fetch,
  clock: createFakeClock(START_MS),
});

describe("the Play API base", () => {
  it.each([
    BASE_URL,
    `${BASE_URL}/`,
    "https://se.example.test",
    "https://se.example.test:8443/play/v1",
    "http://localhost/play/v1",
    "http://localhost:8787/play/v1",
    "http://127.0.0.1:8787/play/v1",
    "http://[::1]:8787/play/v1",
  ])("accepts %s", baseUrl => {
    expect(() => createTransport({ ...base(), baseUrl })).not.toThrow();
  });

  it.each([
    `${BASE_URL}?x=1`,
    `${BASE_URL}#x`,
    "se.example.test/play/v1",
    "ftp://se.example.test",
    "http://se.example.test/play/v1",
    "http://localhost.example.test/play/v1",
    "http://127.0.0.2/play/v1",
    "http://10.0.0.1/play/v1",
    "https://user:secret@se.example.test/play/v1",
    "HTTPS://se.example.test",
  ])("refuses %s", baseUrl => {
    expect(() => createTransport({ ...base(), baseUrl })).toThrow(TypeError);
  });
});

describe("the request timeout", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s",
    timeoutMs => {
      expect(() => createTransport({ ...base(), timeoutMs })).toThrow(
        RangeError,
      );
    },
  );
});

describe("the retry configuration", () => {
  it.each<[string, Partial<RetryConfig>]>([
    ["maxAttempts 0", { maxAttempts: 0 }],
    ["maxAttempts 1.5", { maxAttempts: 1.5 }],
    ["maxAttempts NaN", { maxAttempts: Number.NaN }],
    ["maxAttempts Infinity", { maxAttempts: Number.POSITIVE_INFINITY }],
    ["a negative initial delay", { initialDelayMs: -1 }],
    ["a NaN initial delay", { initialDelayMs: Number.NaN }],
    ["an infinite maximum delay", { maxDelayMs: Number.POSITIVE_INFINITY }],
    ["an initial delay above the maximum", { initialDelayMs: 3_000 }],
  ])("refuses %s", (_name, change) => {
    expect(() =>
      createTransport({
        ...base(),
        retry: { ...DEFAULT_RETRY_CONFIG, ...change },
      }),
    ).toThrow(RangeError);
  });

  it("accepts one attempt and no wait", () => {
    expect(() =>
      createTransport({
        ...base(),
        retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0 },
      }),
    ).not.toThrow();
  });
});
