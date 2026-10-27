import { describe, expect, it } from "vitest";

import {
  bytesOf,
  environment,
  hasProxyHeaders,
  onlySent,
  recorder,
  SITE,
  UPSTREAM,
} from "./fixtures/proxy.ts";
import { proxyRequest } from "./worker.ts";

// The Pages API proxy's forwarding (specs/client-kit.md, The Pages API proxy):
// the request passes through, and the answer comes back with the proxy's two
// security headers. An injected `fetch`: no network, no clock.

describe("forwarding", () => {
  it("passes the method, path, and query through to the upstream origin", async () => {
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r-1?expand=a%2Cb&x=%20`, {
        method: "GET",
      }),
      environment(),
      send,
    );
    const { url, init } = onlySent(sent);
    expect(url).toBe(`${UPSTREAM}/verify/v1/rounds/r-1?expand=a%2Cb&x=%20`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeNull();
    expect(init.redirect).toBe("manual");
  });

  it("passes a signed action's body through byte for byte, as a stream", async () => {
    // Not canonical JSON on purpose: odd spacing, key order, an escaped
    // character, a non-ASCII one, and a trailing newline must all survive.
    const body = new TextEncoder().encode(
      '{ "z":1,"a" : "\\u00e9\u00E9",\n"sig":"0xABCDEF" }\n',
    );
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/play/v1/rounds:start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      environment(),
      send,
    );
    const { init } = onlySent(sent);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect((init as { duplex?: string }).duplex).toBe("half");
    expect(await bytesOf(init.body)).toEqual(body);
  });

  it("passes the other headers through unchanged", async () => {
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/play/v1/sessions:refresh`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-only-not-a-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "k-1",
          Accept: "application/json",
        },
        body: "{}",
      }),
      environment(),
      send,
    );
    const headers = new Headers(onlySent(sent).init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-only-not-a-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("k-1");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("asks for no caching on the forwarded request, and sets nothing else", async () => {
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r-1`),
      environment(),
      send,
    );
    const { init } = onlySent(sent);
    expect(init.cache).toBe("no-store");
    expect(Object.keys(init).toSorted()).toEqual([
      "body",
      "cache",
      "headers",
      "method",
      "redirect",
    ]);
  });
});

describe("the answer", () => {
  it("keeps the upstream's status, headers, and body, adding no caching header", async () => {
    const upstream = new Response('{"ok":true}', {
      status: 409,
      statusText: "Conflict",
      headers: { "Content-Type": "application/json", "X-Test": "1" },
    });
    const { send } = recorder(() => upstream);
    const response = await proxyRequest(
      new Request(`${SITE}/play/v1/rounds:start`, {
        method: "POST",
        body: "{}",
      }),
      environment(),
      send,
    );
    expect(response.status).toBe(409);
    expect(response.statusText).toBe("Conflict");
    expect(await response.text()).toBe('{"ok":true}');
    expect([...response.headers.keys()].toSorted()).toEqual([
      "content-security-policy",
      "content-type",
      "x-content-type-options",
      "x-test",
    ]);
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("sets the proxy's security headers over the upstream's", async () => {
    const upstream = new Response("x", {
      headers: {
        "Content-Security-Policy": "default-src *",
        "X-Content-Type-Options": "off",
        "Cache-Control": "max-age=60",
      },
    });
    const { send } = recorder(() => upstream);
    const response = await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r`),
      environment(),
      send,
    );
    expect(hasProxyHeaders(response)).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("max-age=60");
  });

  it("returns a redirect as it is, not followed", async () => {
    const upstream = new Response(null, {
      status: 302,
      headers: { Location: "https://elsewhere.example.test/" },
    });
    const { send } = recorder(() => upstream);
    const response = await proxyRequest(
      new Request(`${SITE}/verify/v1/rounds/r`),
      environment(),
      send,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://elsewhere.example.test/",
    );
    expect(hasProxyHeaders(response)).toBe(true);
  });
});
