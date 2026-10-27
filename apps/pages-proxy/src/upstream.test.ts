import { describe, expect, it } from "vitest";

import {
  environment,
  hasProxyHeaders,
  recorder,
  SITE,
  UPSTREAM,
} from "./fixtures/proxy.ts";
import { proxyRequest, upstreamOriginOf } from "./worker.ts";

// The Pages API proxy's upstream origin and failures (specs/client-kit.md, The
// Pages API proxy): exactly an https origin, or a bare 502 with the security
// headers. Injected `fetch` and assets, no network.

describe("the upstream origin", () => {
  it.each([
    ["https://api.example.test", "https://api.example.test"],
    ["https://api.example.test:8443", "https://api.example.test:8443"],
  ])("accepts %s", (value, origin) => {
    expect(upstreamOriginOf(value)).toBe(origin);
  });

  it.each([
    undefined,
    "",
    "api.example.test",
    "http://api.example.test",
    "https://api.example.test/",
    "https://api.example.test/play",
    "https://api.example.test?x=1",
    "https://user@api.example.test",
    "https://API.example.test",
    42,
  ])("refuses %s", value => {
    expect(upstreamOriginOf(value)).toBeNull();
  });

  it.each([null, "", "http://api.example.test", "https://x.test/path"])(
    "answers a bare 502 and forwards nothing when the origin is %j",
    async value => {
      const { send, sent } = recorder();
      const response = await proxyRequest(
        new Request(`${SITE}/play/v1/sessions:redeem`, {
          method: "POST",
          body: "{}",
        }),
        environment(value),
        send,
      );
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
      expect([...response.headers.keys()].toSorted()).toEqual([
        "content-security-policy",
        "x-content-type-options",
      ]);
      expect(hasProxyHeaders(response)).toBe(true);
      expect(sent).toEqual([]);
    },
  );

  it("still serves the static assets without an upstream origin", async () => {
    const { send } = recorder();
    const response = await proxyRequest(
      new Request(`${SITE}/`),
      environment(null),
      send,
    );
    expect(await response.text()).toBe("asset");
  });
});

describe("failures", () => {
  it("answers a bare 502 with the security headers when the upstream cannot be reached", async () => {
    const response = await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r-1`),
      environment(),
      () => Promise.reject(new TypeError("network down at api.example.test")),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    expect(hasProxyHeaders(response)).toBe(true);
  });

  it("answers a bare 502 when reading a static asset fails", async () => {
    const { send } = recorder();
    const response = await proxyRequest(
      new Request(`${SITE}/index.html`),
      environment(UPSTREAM, undefined, { assetsFail: true }),
      send,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    expect(hasProxyHeaders(response)).toBe(true);
  });
});
