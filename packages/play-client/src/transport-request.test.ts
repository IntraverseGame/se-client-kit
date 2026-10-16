import { beforeEach, describe, expect, it } from "vitest";

import { json } from "./fixtures/fake-play-api.ts";
import { authorized, createHarness, type Harness } from "./fixtures/harness.ts";
import {
  BASE_URL,
  FIXTURE_TOKEN,
  SERVER_AHEAD_DATE,
  START_MS,
  longToken,
} from "./fixtures/session.ts";
import { ProtocolError } from "./protocol-error.ts";
import { parseDeadline, refreshAtMs } from "./token-schedule.ts";

let h: Harness;

beforeEach(() => {
  h = createHarness();
});

const ACCEPT = "application/json, application/problem+json";

describe("request options (W-3)", () => {
  it("sends the token only in the Authorization header, with credentials omitted", async () => {
    h.api.reply(json(200, { ok: true }));
    await h.transport.send(
      authorized({
        method: "POST",
        path: "/sessions/s1/actions",
        body: { a: "1" },
        retry: "idempotent",
      }),
    );
    expect(h.api.requests).toHaveLength(1);
    const { url, init } = h.request(0);
    expect(url).toBe(`${BASE_URL}/sessions/s1/actions`);
    expect(url).not.toContain(FIXTURE_TOKEN);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ a: "1" }),
    });
    expect(init.body).not.toContain(FIXTURE_TOKEN);
    expect(init.headers).toEqual({
      accept: ACCEPT,
      "content-type": "application/json",
      authorization: `Bearer ${FIXTURE_TOKEN}`,
    });
  });

  it("sends no Authorization header and no body when none is given", async () => {
    h.api.reply(json(200, {}));
    await h.transport.send({
      method: "GET",
      path: "/snapshot",
      retry: "idempotent",
    });
    expect(h.request(0).init.headers).toEqual({ accept: ACCEPT });
    expect(h.request(0).init).not.toHaveProperty("body");
  });

  it.each([
    "/snapshot?token=x",
    "/snapshot#x",
    "snapshot",
    "/a/../b",
    "//host/x",
    "/a b",
  ])("refuses the path %s and sends nothing", async path => {
    await expect(
      h.transport.send({ method: "GET", path, retry: "idempotent" }),
    ).rejects.toThrow(TypeError);
    expect(h.api.requests).toHaveLength(0);
  });

  it("refuses a refresh without the old token's deadline", async () => {
    const refresh = {
      method: "POST",
      path: "/sessions/s1/refresh",
      retry: "refresh",
    } as const;
    // @ts-expect-error -- a refresh must name notAfterMs; the type refuses it
    await expect(h.transport.send(refresh)).rejects.toThrow(TypeError);
    expect(h.api.requests).toHaveLength(0);
  });
});

describe("redirects (W-3)", () => {
  it("are refused by the request options", async () => {
    h.api.reply(json(200, {}));
    await h.transport.send({ method: "GET", path: "/x", retry: "never" });
    expect(h.request(0).init).toMatchObject({ redirect: "error" });
  });

  it("surface as a ProtocolError when a 3xx response is handed back", async () => {
    h.api.reply({
      kind: "response",
      status: 302,
      headers: { location: "/elsewhere" },
    });
    const { error } = await h.settle(
      h.transport.send({ method: "GET", path: "/x", retry: "idempotent" }),
    );
    expect(error).toBeInstanceOf(ProtocolError);
    expect(error).toMatchObject({ status: 302 });
    expect(h.api.requests).toHaveLength(1);
  });
});

describe("responses", () => {
  it("returns the body uninterpreted", async () => {
    const snapshot = {
      schema: "se.snapshot/1",
      status: "active",
      unknownField: [1, 2],
    };
    h.api.reply(json(200, snapshot));
    const response = await h.transport.send({
      method: "GET",
      path: "/snapshot",
      retry: "idempotent",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(snapshot);
  });

  it("returns an empty body as undefined", async () => {
    h.api.reply({ kind: "response", status: 204 });
    const response = await h.transport.send({
      method: "POST",
      path: "/x",
      retry: "idempotent",
    });
    expect(response.body).toBeUndefined();
  });

  it("rejects a 2xx body that is not JSON with a ProtocolError", async () => {
    h.api.reply({ kind: "response", status: 200, body: "<html>" });
    const { error } = await h.settle(
      h.transport.send({ method: "GET", path: "/x", retry: "never" }),
    );
    expect(error).toBeInstanceOf(ProtocolError);
    expect(error).toMatchObject({ status: 200, method: "GET", path: "/x" });
  });
});

describe("clock offset from the Date header (W-6)", () => {
  it("measures the server clock against the local one", async () => {
    h.api.reply(json(200, longToken, { date: SERVER_AHEAD_DATE }));
    const response = await h.transport.send({
      method: "POST",
      path: "/sessions",
      retry: "never",
    });
    expect(response.receivedAtMs).toBe(START_MS);
    expect(response.clockOffsetMs).toBe(
      Date.parse(SERVER_AHEAD_DATE) - START_MS,
    );
  });

  it("is undefined without a Date header", async () => {
    h.api.reply(json(200, longToken));
    const response = await h.transport.send({
      method: "POST",
      path: "/sessions",
      retry: "never",
    });
    expect(response.clockOffsetMs).toBeUndefined();
  });

  it("moves the refresh point by the measured offset", async () => {
    h.api.reply(json(200, longToken, { date: SERVER_AHEAD_DATE }));
    const response = await h.transport.send({
      method: "POST",
      path: "/sessions",
      retry: "never",
    });
    const expiresAtMs = Number(parseDeadline(longToken.tokenExpiresAt));
    const offset = Number(response.clockOffsetMs);
    const at = refreshAtMs({
      expiresAtMs,
      receivedAtMs: response.receivedAtMs,
      clockOffsetMs: offset,
    });
    // The server is 90 s ahead: the token's local deadline is 90 s earlier,
    // and the lifetime seen from here is shorter by as much.
    const localDeadline = expiresAtMs - offset;
    const lifetime = localDeadline - START_MS;
    expect(at).toBe(Math.floor(localDeadline - lifetime / 3));
    expect(at).toBeLessThan(
      refreshAtMs({
        expiresAtMs,
        receivedAtMs: response.receivedAtMs,
        clockOffsetMs: 0,
      }),
    );
  });
});
