import { describe, expect, it } from "vitest";

import {
  environment,
  hasProxyHeaders,
  recorder,
  SITE,
  UPSTREAM,
  VERIFIER_PREFIXES,
} from "./fixtures/proxy.ts";
import {
  isApiPath,
  isRefusedPath,
  pathPrefixesOf,
  proxyRequest,
} from "./worker.ts";

// The Pages API proxy's paths (specs/client-kit.md, The Pages API proxy): the
// known prefixes, each site's own list, and the refused paths. An injected
// `fetch` and a fake asset binding: no network, no clock.

describe("the path allow-list", () => {
  it.each([
    "/play/v1/sessions:redeem",
    "/play/v1/rounds:start",
    "/verify/v1/rounds/abc",
  ])("knows %s", path => {
    expect(isApiPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/index.html",
    "/verify/",
    "/verify/index.html",
    "/play/v1",
    "/play/v2/x",
    "/operator/v1/launch",
    "/admin/v1/x",
    "/PLAY/v1/x",
  ])("does not know %s", path => {
    expect(isApiPath(path)).toBe(false);
  });

  it.each(["/", "/verify/", "/operator/v1/launch", "/x/y"])(
    "serves %s from the static assets, unforwarded",
    async path => {
      const { send, sent } = recorder();
      const response = await proxyRequest(
        new Request(`${SITE}${path}`),
        environment(),
        send,
      );
      expect(await response.text()).toBe("asset");
      expect(sent).toEqual([]);
    },
  );

  it("matches the normalized path, so dot segments cannot leave the API", async () => {
    const { send, sent } = recorder();
    const response = await proxyRequest(
      new Request(`${SITE}/play/v1/../../admin/x`),
      environment(),
      send,
    );
    expect(await response.text()).toBe("asset");
    expect(sent).toEqual([]);
  });
});

describe("each site's prefixes", () => {
  it.each([
    ["/play/v1/ /verify/v1/", ["/play/v1/", "/verify/v1/"]],
    ["/verify/v1/", ["/verify/v1/"]],
    [" /play/v1/\n", ["/play/v1/"]],
  ])("reads %j", (value, prefixes) => {
    expect(pathPrefixesOf(value)).toEqual(prefixes);
  });

  it.each([
    undefined,
    "",
    " ",
    "/operator/v1/",
    "/play/v1",
    "/",
    "/play/v1/ /x/",
  ])("refuses %j", value => {
    expect(pathPrefixesOf(value)).toBeNull();
  });

  it.each([
    ["/play/v1/sessions:redeem", `${UPSTREAM}/play/v1/sessions:redeem`],
    ["/verify/v1/rounds/r", `${UPSTREAM}/verify/v1/rounds/r`],
  ])("forwards %s on the Wrapper's site", async (path, target) => {
    const { send, sent } = recorder();
    await proxyRequest(new Request(`${SITE}${path}`), environment(), send);
    expect(sent.map(entry => entry.url)).toEqual([target]);
  });

  it("forwards /verify/v1/ on the verifier's site", async () => {
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r`),
      environment(UPSTREAM, VERIFIER_PREFIXES),
      send,
    );
    expect(sent.map(entry => entry.url)).toEqual([
      `${UPSTREAM}/verify/v1/rounds/r`,
    ]);
  });

  it("never forwards /play/v1/ on the verifier's site", async () => {
    const { send, sent } = recorder();
    const response = await proxyRequest(
      new Request(`${SITE}/play/v1/sessions:redeem`, {
        method: "POST",
        body: "{}",
      }),
      environment(UPSTREAM, VERIFIER_PREFIXES),
      send,
    );
    expect(await response.text()).toBe("asset");
    expect(sent).toEqual([]);
  });

  it.each([null, "", "/operator/v1/"])(
    "answers a bare 502 when the prefixes are %j",
    async prefixes => {
      const { send, sent } = recorder();
      const response = await proxyRequest(
        new Request(`${SITE}/verify/v1/rounds/r`),
        environment(UPSTREAM, prefixes),
        send,
      );
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
      expect(hasProxyHeaders(response)).toBe(true);
      expect(sent).toEqual([]);
    },
  );
});

describe("refused paths", () => {
  it.each([
    "/play/v1/rounds%2fstart",
    "/play/v1/rounds%2Fstart",
    "/play/v1/a%5cb",
    "/play/v1/a%5Cb",
    "/play/v1/a%2eb",
    "/play/v1/a%2Eb",
    "/play/v1//rounds:start",
    "//play/v1/rounds:start",
    "/verify/v1/rounds/r/",
    "/play/v1/",
  ])("refuses %s with a bare 400, unforwarded", async path => {
    const { send, sent } = recorder();
    expect(isRefusedPath(`${SITE}${path}`)).toBe(true);
    const response = await proxyRequest(
      new Request(`${SITE}${path}`),
      environment(),
      send,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
    expect(hasProxyHeaders(response)).toBe(true);
    expect(sent).toEqual([]);
  });

  it("never forwards a %2e%2e segment, refused or normalized away", async () => {
    // A `Request` may already have resolved `%2e%2e` (WHATWG URL), leaving
    // `/play/admin`: then it is not an API path and goes to the assets.
    const raw = `${SITE}/play/v1/%2e%2e/admin`;
    expect(isRefusedPath(raw)).toBe(true);
    const { send, sent } = recorder();
    const response = await proxyRequest(new Request(raw), environment(), send);
    expect([400, 200]).toContain(response.status);
    expect(sent).toEqual([]);
  });

  it.each(["/verify/", "/", "/play/v1/sessions:redeem"])(
    "lets %s through",
    path => {
      expect(isRefusedPath(`${SITE}${path}`)).toBe(false);
    },
  );

  it("looks at the path only, not the query", () => {
    expect(isRefusedPath(`${SITE}/play/v1/x?next=%2f%2e`)).toBe(false);
    expect(isRefusedPath(`${SITE}/play/v1/x?a=b//c`)).toBe(false);
  });
});
