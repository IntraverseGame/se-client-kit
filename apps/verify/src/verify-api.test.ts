// VT-3: the verify API read (V-9 to V-11): the request it makes, and what each
// status, a body that is not JSON, and a failed or timed-out fetch become. The
// body's validation is in `verify-body.test.ts`.

import { describe, expect, it } from "vitest";

import { httpFake, type Reply } from "./fixtures/http-fake.ts";
import { wonBody } from "./fixtures/verify-body.ts";
import {
  createVerifyApi,
  VERIFY_API_TIMEOUT_MS,
  type VerifyApiResult,
} from "./verify-api.ts";

const BASE = "https://se.example/verify/v1";
const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
const body = wonBody;

const read = async (
  reply: Reply,
  unbound = false,
): Promise<{ result: VerifyApiResult; fake: ReturnType<typeof httpFake> }> => {
  const fake = httpFake(reply, unbound);
  const api = createVerifyApi({
    fetch: fake.fetch,
    clock: fake.clock,
    baseUrl: BASE,
  });
  return { result: await api.readRound(ID), fake };
};

describe("the request", () => {
  it("asks <verifyApiBaseUrl>/rounds/{roundId}, without credentials", async () => {
    const { fake } = await read({ kind: "json", body: body() });
    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.url).toBe(`${BASE}/rounds/${ID}`);
    expect(request?.init.method).toBe("GET");
    expect(request?.init.credentials).toBe("omit");
    expect(request?.init.cache).toBe("no-store");
    expect(request?.init.redirect).toBe("error");
  });

  // The browser's `fetch` throws "Illegal invocation" when it is called with
  // another `this`; `createVerifyApi` must call it unbound, as `chain-read.ts`
  // does.
  it("calls fetch unbound (the fake throws otherwise)", async () => {
    const { result } = await read({ kind: "json", body: body() }, true);
    expect(result.kind).toBe("found");
  });

  it("sets one 15 s timer and clears it", async () => {
    const { fake } = await read({ kind: "json", body: body() });
    expect(fake.delays).toEqual([VERIFY_API_TIMEOUT_MS]);
    expect(VERIFY_API_TIMEOUT_MS).toBe(15_000);
    expect(fake.pending()).toBe(0);
  });
});

describe("a round found", () => {
  it("reads a body that validates as evidence", async () => {
    const { result } = await read({ kind: "json", body: body() });
    expect(result.kind).toBe("found");
  });
});

describe("statuses", () => {
  it("reads 404 as not found (V-9)", async () => {
    const { result } = await read({ kind: "json", status: 404, body: {} });
    expect(result).toEqual({ kind: "not-found" });
  });

  it.each([400, 403, 429, 500, 503])(
    "reads %i as an API error (V-10)",
    async status => {
      const { result } = await read({ kind: "json", status, body: body() });
      expect(result).toEqual({ kind: "error" });
    },
  );

  it("reads a body that is not JSON as an API error", async () => {
    const { result } = await read({ kind: "text", body: "<html>" });
    expect(result).toEqual({ kind: "error" });
  });

  it("reads a rejected fetch as unreachable (V-11)", async () => {
    const { result, fake } = await read({ kind: "reject" });
    expect(result).toEqual({ kind: "unreachable" });
    expect(fake.pending()).toBe(0);
  });

  it("reads a timeout as unreachable (V-11)", async () => {
    const { result, fake } = await read({ kind: "hang" });
    expect(result).toEqual({ kind: "unreachable" });
    expect(fake.pending()).toBe(0);
  });
});

const start = (reply: Reply, signal?: AbortSignal) => {
  const fake = httpFake(reply);
  const api = createVerifyApi({
    fetch: fake.fetch,
    clock: fake.clock,
    baseUrl: BASE,
  });
  return { fake, answer: api.readRound(ID, signal) };
};

describe("an aborted read", () => {
  it("sends the read's signal to fetch", async () => {
    const controller = new AbortController();
    const { fake, answer } = start({ kind: "wait" }, controller.signal);
    await Promise.resolve();
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.init.signal).toBeDefined();
    expect(fake.requests[0]?.init.signal?.aborted).toBe(false);
    controller.abort();
    await answer;
    expect(fake.requests[0]?.init.signal?.aborted).toBe(true);
  });

  it("ends the request and answers aborted, not unreachable (V-11)", async () => {
    const controller = new AbortController();
    const { fake, answer } = start({ kind: "wait" }, controller.signal);
    controller.abort();
    expect(await answer).toEqual({ kind: "aborted" });
    expect(fake.pending()).toBe(0);
  });

  it("answers aborted for a signal that is aborted already", async () => {
    const controller = new AbortController();
    controller.abort();
    const { answer } = start({ kind: "wait" }, controller.signal);
    expect(await answer).toEqual({ kind: "aborted" });
  });

  it("reads a timeout as unreachable even with a signal that stands", async () => {
    const controller = new AbortController();
    const { answer } = start({ kind: "hang" }, controller.signal);
    expect(await answer).toEqual({ kind: "unreachable" });
  });

  it("reads an answer that comes before the abort as the answer", async () => {
    const controller = new AbortController();
    const { answer } = start({ kind: "json", body: body() }, controller.signal);
    expect((await answer).kind).toBe("found");
  });
});
