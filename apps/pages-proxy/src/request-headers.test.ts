import { describe, expect, it } from "vitest";

import { environment, onlySent, recorder, SITE } from "./fixtures/proxy.ts";
import { forwardedHeaders, proxyRequest } from "./worker.ts";

// The Pages API proxy's request headers (specs/client-kit.md, The Pages API
// proxy): the client IP in X-Forwarded-For, and the headers never forwarded.

describe("the client IP", () => {
  it("replaces X-Forwarded-For with CF-Connecting-IP and drops that one", () => {
    const headers = forwardedHeaders(
      new Headers({
        "CF-Connecting-IP": "203.0.113.7",
        "X-Forwarded-For": "198.51.100.1, 192.0.2.9",
        Host: "site.example.test",
      }),
    );
    expect(headers.get("X-Forwarded-For")).toBe("203.0.113.7");
    expect(headers.get("CF-Connecting-IP")).toBeNull();
    expect(headers.get("Host")).toBeNull();
  });

  it("drops a client-supplied X-Forwarded-For when there is no client IP", () => {
    const headers = forwardedHeaders(
      new Headers({ "X-Forwarded-For": "198.51.100.1" }),
    );
    expect(headers.get("X-Forwarded-For")).toBeNull();
  });

  it("forwards the client IP on a proxied request", async () => {
    const { send, sent } = recorder();
    await proxyRequest(
      new Request(`${SITE}/play/v1/sessions:redeem`, {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "2001:db8::1",
          "X-Forwarded-For": "spoofed",
        },
        body: "{}",
      }),
      environment(),
      send,
    );
    const headers = new Headers(onlySent(sent).init.headers);
    expect(headers.get("X-Forwarded-For")).toBe("2001:db8::1");
  });
});

describe("headers never forwarded", () => {
  it.each([
    "Connection",
    "Keep-Alive",
    "TE",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade",
    "Proxy-Authorization",
    "Proxy-Connection",
    "Forwarded",
    "X-Real-IP",
    "True-Client-IP",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Original-URL",
    "X-Rewrite-URL",
    "X-HTTP-Method-Override",
  ])("drops %s", name => {
    const headers = forwardedHeaders(new Headers({ [name]: "x", Accept: "a" }));
    expect(headers.get(name)).toBeNull();
    expect(headers.get("Accept")).toBe("a");
  });

  it.each([
    ["a b", "1"],
    ["x-hop, a b, (bad)", null],
    [",,", "1"],
  ])(
    "skips a Connection token that is not a header name (%j) and still forwards",
    async (connection, hop) => {
      const { send, sent } = recorder();
      const response = await proxyRequest(
        new Request(`${SITE}/play/v1/sessions:redeem`, {
          method: "POST",
          headers: { Connection: connection, "X-Hop": "1", Accept: "a" },
          body: "{}",
        }),
        environment(),
        send,
      );
      expect(response.status).toBe(200);
      const headers = new Headers(onlySent(sent).init.headers);
      expect(headers.get("Connection")).toBeNull();
      expect(headers.get("Accept")).toBe("a");
      expect(headers.get("X-Hop")).toBe(hop);
    },
  );

  it("drops every header Connection lists", () => {
    const headers = forwardedHeaders(
      new Headers({
        Connection: "X-Secret-Hop, x-other",
        "X-Secret-Hop": "1",
        "X-Other": "2",
        "X-Kept": "3",
      }),
    );
    expect([...headers.keys()]).toEqual(["x-kept"]);
  });
});
