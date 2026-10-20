// The verify API read on the request layer: what it sends (no credential, the
// round id in the path), what it answers, and how each outcome of the
// document is mapped to the client's typed errors.

import { describe, expect, it } from "vitest";

import { createFakeClock } from "./fixtures/fake-clock.ts";
import { START_MS } from "./fixtures/session.ts";
import { NetworkError } from "./network-error.ts";
import type { FetchLike, RequestInitLike } from "./platform.ts";
import { ProblemError } from "./problem-error.ts";
import { ProtocolError } from "./protocol-error.ts";
import type { RetryConfig } from "./retry.ts";
import { createTransport } from "./transport.ts";
import {
  getRoundVerification,
  VERIFY_ROUTES,
  verifyRoute,
} from "./verify-api.ts";

const BASE = "https://se.example.test/verify/v1";
const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

type Reply = { readonly status: number; readonly body: string };
type Sent = { readonly url: string; readonly init: RequestInitLike };

/** A transport over a fetch that answers `replies` in order, and records. */
const ONE_ATTEMPT = { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0 };

const setup = (
  replies: readonly Reply[],
  config: {
    readonly clock?: ReturnType<typeof createFakeClock>;
    readonly retry?: RetryConfig;
  } = {},
) => {
  const sent: Sent[] = [];
  const queue = [...replies];
  const fetch: FetchLike = (url, init) => {
    sent.push({ url, init });
    const reply = queue.shift() ?? { status: 500, body: "" };
    return Promise.resolve({
      status: reply.status,
      headers: { get: () => null },
      text: () => Promise.resolve(reply.body),
    });
  };
  const transport = createTransport({
    baseUrl: BASE,
    fetch,
    clock: config.clock ?? createFakeClock(START_MS),
    retry: config.retry ?? ONE_ATTEMPT,
  });
  return { sent, transport };
};

const problem = (status: number, code: string, retryable = false): Reply => ({
  status,
  body: JSON.stringify({
    type: "about:blank",
    title: "Problem",
    status,
    code,
    retryable,
  }),
});

describe("the route", () => {
  it("is the document's, below the base", () => {
    expect(VERIFY_ROUTES.getRoundVerification).toEqual({
      method: "GET",
      path: "/rounds/{roundId}",
    });
    expect(
      verifyRoute("getRoundVerification", "/verify/v1/rounds/{roundId}"),
    ).toEqual(VERIFY_ROUTES.getRoundVerification);
  });

  it("does not compile for a path the document does not serve", () => {
    // @ts-expect-error -- the document has no such path
    verifyRoute("getRoundVerification", "/verify/v1/rounds");
    expect(true).toBe(true);
  });
});

describe("getRoundVerification", () => {
  it("sends one credential-free GET to <base>/rounds/{roundId}", async () => {
    const { sent, transport } = setup([{ status: 200, body: "{}" }]);
    await getRoundVerification(transport, ID);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${BASE}/rounds/${ID}`);
    expect(sent[0]?.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(sent[0]?.init.headers).not.toHaveProperty("authorization");
    expect(sent[0]?.init.headers).not.toHaveProperty("content-type");
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it("percent-encodes the round id into the path", async () => {
    const { sent, transport } = setup([{ status: 200, body: "{}" }]);
    await getRoundVerification(transport, "a b");
    expect(sent[0]?.url).toBe(`${BASE}/rounds/a%20b`);
  });

  it("answers the body as unknown, with when it arrived", async () => {
    const { transport } = setup([{ status: 200, body: '{"roundId":"x"}' }]);
    const result = await getRoundVerification(transport, ID);
    expect(result.body).toEqual({ roundId: "x" });
    expect(result.receivedAtMs).toBe(START_MS);
    expect(result.clockOffsetMs).toBeUndefined();
  });

  it.each([
    [404, "NOT_FOUND"],
    [400, "INVALID_ARGUMENT"],
    [429, "RATE_LIMITED"],
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
  ])("rejects %i as a ProblemError with its code", async (status, code) => {
    const { transport } = setup([problem(status, code)]);
    const error = await getRoundVerification(transport, ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProblemError);
    expect((error as ProblemError).problem).toMatchObject({ status, code });
  });

  it("rejects an error status without a problem body as a ProtocolError", async () => {
    const { transport } = setup([{ status: 404, body: "" }]);
    const error = await getRoundVerification(transport, ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).status).toBe(404);
  });

  it("rejects a 200 that is not JSON as a ProtocolError", async () => {
    const { transport } = setup([{ status: 200, body: "{ not json" }]);
    await expect(getRoundVerification(transport, ID)).rejects.toBeInstanceOf(
      ProtocolError,
    );
  });

  it("rejects a failed fetch as a NetworkError", async () => {
    const transport = createTransport({
      baseUrl: BASE,
      fetch: () => Promise.reject(new TypeError("offline")),
      clock: createFakeClock(START_MS),
      retry: ONE_ATTEMPT,
    });
    await expect(getRoundVerification(transport, ID)).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("repeats a read on a retryable problem, as the transport's class allows", async () => {
    const clock = createFakeClock(START_MS);
    const { sent, transport } = setup(
      [problem(503, "UNAVAILABLE", true), { status: 200, body: "{}" }],
      { clock, retry: { maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 10 } },
    );
    const pending = getRoundVerification(transport, ID);
    await clock.advance(10);
    await pending;
    expect(sent).toHaveLength(2);
    expect(sent[1]?.url).toBe(sent[0]?.url);
    expect(sent[1]?.init.headers).toEqual(sent[0]?.init.headers);
  });
});
