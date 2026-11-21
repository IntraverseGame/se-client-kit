// @vitest-environment jsdom
// T-47, the page up to the wallet (SP-3 to SP-7, SP-10): with no opener, the
// lost-connection state and no configuration read, discovery, or message; a
// refused configuration, its error state and no `ready`; `ready` once per
// allowed origin, each with that origin as `targetOrigin`; a message from
// another source or origin, or a malformed one, ignored; one request only; no
// request within 10 s, the timed-out state; a bad value `invalid-request`; an
// unknown notice `unknown-notice` before any wallet is asked; each answer to
// the fixed origin, then the opener dropped, then the window closed by the page
// (SP-9); a page that never answers never closes itself.

import { describe, expect, it } from "vitest";

import { acceptedVector } from "./fixtures/accepted-vector.ts";
import { settle } from "./fixtures/fake-clock.ts";
import {
  ANSWERED,
  DEFAULT_CONFIG,
  headingOf,
  type HostOptions,
  NOT_JSON,
  OTHER_WRAPPER_ORIGIN,
  type TestHost,
  testHost,
  WRAPPER_ORIGIN,
} from "./fixtures/page-host.ts";
import { TEXT } from "./messages.ts";
import { MAX_EXPIRY_SECONDS } from "./protocol.ts";
import { REQUEST_TIMEOUT_MS, runSigningPage } from "./signing-page.ts";
import { REQUEST_EVENT } from "./wallet-discovery.ts";

const READY = { schema: "se.delegation/1", type: "ready" };
const vector = acceptedVector();
const REQUEST = {
  schema: "se.delegation/1",
  type: "request",
  ...vector.request,
};

/** The page started on a test host, once its first state is shown. */
const started = async (options: HostOptions = {}): Promise<TestHost> => {
  const host = testHost(options);
  const requests: unknown[] = [];
  host.events.addEventListener(REQUEST_EVENT, event => requests.push(event));
  void runSigningPage(host);
  await settle();
  return Object.assign(host, { discoveryRequests: requests });
};

const discoveryRequests = (host: TestHost): unknown[] =>
  (host as TestHost & { readonly discoveryRequests: unknown[] })
    .discoveryRequests;

const failed = (reason: string) => ({
  schema: "se.delegation/1",
  type: "failed",
  reason,
});

describe("the opener first (SP-4)", () => {
  it("with no opener: the lost-connection state, and nothing else", async () => {
    const host = await started({ opener: null });
    expect(headingOf(host)).toBe(TEXT.lost);
    expect(host.fetches).toEqual([]);
    expect(host.opener.posted).toEqual([]);
    expect(discoveryRequests(host)).toEqual([]);
    expect(host.clock.pending()).toEqual([]);
    expect(host.steps).toEqual([]);
  });
});

describe("the configuration (SP-3)", () => {
  it.each([
    ["refused", { config: { ...DEFAULT_CONFIG, extra: true } }],
    ["not JSON", { config: NOT_JSON }],
    ["an error status", { status: 404 }],
    [
      "pending notices in production",
      { config: { ...DEFAULT_CONFIG, environment: "production" } },
    ],
  ])(
    "%s: the configuration error state and no ready",
    async (_name, options) => {
      const host = await started(options);
      expect(headingOf(host)).toBe(TEXT.configError);
      expect(host.opener.posted).toEqual([]);
      expect(host.fetches).toHaveLength(1);
      expect(host.steps).toEqual([]);
    },
  );
});

describe("ready, and the request (SP-5, SP-6)", () => {
  it("posts ready once per allowed origin, each to that origin, never *", async () => {
    const host = await started();
    expect(host.fetches).toEqual([
      "https://signer.example-signer.test/environment-config.json",
    ]);
    expect(host.opener.posted).toEqual([
      { message: READY, origin: WRAPPER_ORIGIN },
      { message: READY, origin: OTHER_WRAPPER_ORIGIN },
    ]);
    expect(headingOf(host)).toBe(TEXT.waitingForGame);
    expect(host.clock.pending()).toEqual([REQUEST_TIMEOUT_MS]);
  });

  it.each([
    ["another source", { source: {} }],
    ["no source", { source: null }],
    ["another origin", { origin: "https://evil.example.test" }],
    ["the page's own origin", { origin: "https://signer.example-signer.test" }],
  ])("ignores a request from %s", async (_name, from) => {
    const host = await started();
    host.send(REQUEST, from);
    await settle();
    expect(host.opener.posted).toHaveLength(2);
    expect(headingOf(host)).toBe(TEXT.waitingForGame);
    expect(discoveryRequests(host)).toEqual([]);
  });

  it.each([
    ["a ready", READY],
    ["a string", JSON.stringify(REQUEST)],
    ["an extra field", { ...REQUEST, notice: "text" }],
  ])(
    "ignores %s, never answered, and still takes the request",
    async (_name, data) => {
      const host = await started();
      host.send(data);
      await settle();
      expect(host.opener.posted).toHaveLength(2);
      host.send({ ...REQUEST, noticeId: "not-a-notice" });
      await settle();
      expect(host.opener.posted.at(-1)).toEqual({
        message: failed("unknown-notice"),
        origin: WRAPPER_ORIGIN,
      });
    },
  );

  it("times out with no request within 10 s, then ignores a request", async () => {
    const host = await started();
    await host.clock.advance(REQUEST_TIMEOUT_MS - 1);
    expect(headingOf(host)).toBe(TEXT.waitingForGame);
    await host.clock.advance(1);
    expect(headingOf(host)).toBe(TEXT.timedOut);
    host.send(REQUEST);
    await settle();
    expect(host.opener.posted).toHaveLength(2);
    expect(discoveryRequests(host)).toEqual([]);
    expect(host.steps).toEqual(["post", "post"]);
  });

  it("answers a bad value invalid-request, to the request's origin, drops the opener, then closes the window", async () => {
    const host = await started();
    host.send({ ...REQUEST, expiry: 0 }, { origin: OTHER_WRAPPER_ORIGIN });
    await settle();
    expect(host.opener.posted.slice(2)).toEqual([
      { message: failed("invalid-request"), origin: OTHER_WRAPPER_ORIGIN },
    ]);
    expect(host.drops).toEqual([3]);
    expect(host.steps).toEqual(ANSWERED);
    expect(headingOf(host)).toBe(TEXT.finishing);
    expect(discoveryRequests(host)).toEqual([]);
    expect(host.clock.pending()).toEqual([]);
  });

  it("answers an expiry a Date cannot hold invalid-request, and does not hang", async () => {
    const host = await started();
    host.send({ ...REQUEST, expiry: MAX_EXPIRY_SECONDS + 1 });
    await settle();
    expect(host.opener.posted.slice(2)).toEqual([
      { message: failed("invalid-request"), origin: WRAPPER_ORIGIN },
    ]);
    expect(host.steps).toEqual(ANSWERED);
    expect(discoveryRequests(host)).toEqual([]);
  });

  it("takes one request: a second one is ignored", async () => {
    const host = await started();
    host.send({ ...REQUEST, noticeId: "not-a-notice" });
    host.send({ ...REQUEST, expiry: 0 });
    await settle();
    expect(host.opener.posted.slice(2)).toEqual([
      { message: failed("unknown-notice"), origin: WRAPPER_ORIGIN },
    ]);
  });
});

describe("the notice (SP-7)", () => {
  it.each([
    ["an id not in the list", { noticeId: "not-a-notice" }, DEFAULT_CONFIG],
    [
      "a pending notice without the flag",
      {},
      { ...DEFAULT_CONFIG, acceptPendingNotices: false },
    ],
  ])(
    "answers %s unknown-notice before any wallet is asked",
    async (_name, change, config) => {
      const host = await started({ config });
      host.send({ ...REQUEST, ...change });
      await settle();
      expect(host.opener.posted.slice(2)).toEqual([
        { message: failed("unknown-notice"), origin: WRAPPER_ORIGIN },
      ]);
      expect(host.drops).toEqual([3]);
      expect(host.steps).toEqual(ANSWERED);
      expect(discoveryRequests(host)).toEqual([]);
    },
  );

  it("with the vendored pending notice and the flag, looks for a wallet", async () => {
    const host = await started();
    host.send(REQUEST);
    await settle();
    expect(headingOf(host)).toBe(TEXT.discovering);
    expect(discoveryRequests(host)).toHaveLength(1);
    expect(host.opener.posted).toHaveLength(2);
  });
});
