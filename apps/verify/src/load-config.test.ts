// V-3: the configuration document is read once from the page's own origin,
// without credentials and never cached, with W-43's timeout; anything but a
// valid document is a configuration error, and the page makes no other request.

import { describe, expect, it } from "vitest";

import { environmentDocument, OWN_ORIGIN } from "./fixtures/environment.ts";
import { httpFake, type Reply } from "./fixtures/http-fake.ts";
import {
  CONFIG_REQUEST_TIMEOUT_MS,
  type ConfigLoadResult,
  loadEnvironmentConfig,
} from "./load-config.ts";

const URL_OF_DOCUMENT = `${OWN_ORIGIN}/environment-config.json`;

const load = async (
  reply: Reply,
  unbound = false,
): Promise<{ result: ConfigLoadResult; fake: ReturnType<typeof httpFake> }> => {
  const fake = httpFake(reply, unbound);
  const result = await loadEnvironmentConfig({
    fetch: fake.fetch,
    clock: fake.clock,
    url: URL_OF_DOCUMENT,
    ownOrigin: OWN_ORIGIN,
  });
  return { result, fake };
};

describe("loadEnvironmentConfig", () => {
  it("reads a valid document once, without credentials, never cached", async () => {
    const { result, fake } = await load({
      kind: "json",
      body: environmentDocument(),
    });
    expect(result.kind).toBe("ok");
    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.url).toBe(URL_OF_DOCUMENT);
    expect(request?.init.credentials).toBe("omit");
    expect(request?.init.cache).toBe("no-store");
    expect(request?.init.redirect).toBe("error");
  });

  // The browser's `fetch` throws "Illegal invocation" when it is called with
  // another `this`; `loadEnvironmentConfig` must call it unbound.
  it("calls fetch unbound (the fake throws otherwise)", async () => {
    const { result } = await load(
      { kind: "json", body: environmentDocument() },
      true,
    );
    expect(result.kind).toBe("ok");
  });

  it("sets one 15 s timer and clears it", async () => {
    const { fake } = await load({ kind: "json", body: environmentDocument() });
    expect(fake.delays).toEqual([CONFIG_REQUEST_TIMEOUT_MS]);
    expect(CONFIG_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(fake.pending()).toBe(0);
  });

  it("returns the issues of an invalid document", async () => {
    const { result } = await load({
      kind: "json",
      body: environmentDocument({ environment: "staging" }),
    });
    expect(result).toEqual({
      kind: "invalid",
      issues: [{ code: "invalid-environment", field: "environment" }],
    });
  });

  it.each([404, 500])("reads status %i as unreadable", async status => {
    const { result } = await load({
      kind: "json",
      status,
      body: environmentDocument(),
    });
    expect(result).toEqual({ kind: "unreadable" });
  });

  it("reads a body that is not JSON as unreadable", async () => {
    const { result } = await load({ kind: "text", body: "{" });
    expect(result).toEqual({ kind: "unreadable" });
  });

  it("reads a rejected fetch as a network failure", async () => {
    const { result, fake } = await load({ kind: "reject" });
    expect(result).toEqual({ kind: "network" });
    expect(fake.pending()).toBe(0);
  });

  it("reads a timeout as a network failure", async () => {
    const { result, fake } = await load({ kind: "hang" });
    expect(result).toEqual({ kind: "network" });
    expect(fake.pending()).toBe(0);
  });
});
