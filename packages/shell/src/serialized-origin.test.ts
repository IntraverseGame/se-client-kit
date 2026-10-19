// T-9, W-37's "different registrable domain" rule without a public suffix list
// (ADR-007): a host's comparison key is its last two labels, an IP literal or
// a single-label host is its own, and two origins may share a site when their
// keys are equal. Two loopback hosts are exempt in `local` only.

import { describe, expect, it } from "vitest";

import { comparisonKey, mayShareSite } from "./serialized-origin.ts";

describe("comparisonKey (ADR-007)", () => {
  it.each([
    ["game.example.com", "example.com"],
    ["a.b.c.example.com", "example.com"],
    ["example.com", "example.com"],
    ["game.example.co.uk", "co.uk"],
    ["x.github.io", "github.io"],
    ["localhost", "localhost"],
    ["127.0.0.1", "127.0.0.1"],
    ["10.0.0.255", "10.0.0.255"],
    ["[::1]", "[::1]"],
    // Not an IPv4 literal in canonical form: labels.
    ["1.2.3", "2.3"],
    ["1.2.3.256", "3.256"],
    ["01.2.3.4", "3.4"],
  ])("%s is keyed %s", (host, key) => {
    expect(comparisonKey(host)).toBe(key);
  });
});

describe("mayShareSite (W-37)", () => {
  it.each([
    ["https://game.example.com", "https://play.example.com"],
    ["https://example.com", "https://play.example.com"],
    ["https://game.example.com:8443", "https://example.com"],
    // A shared multi-label public suffix fails closed (ADR-007's cost).
    ["https://a.co.uk", "https://b.co.uk"],
    ["https://one.github.io", "https://two.github.io"],
  ])("%s and %s may share a site", (a, b) => {
    for (const environment of ["production", "preview", "local"] as const) {
      expect(mayShareSite(a, b, environment)).toBe(true);
      expect(mayShareSite(b, a, environment)).toBe(true);
    }
  });

  it.each([
    ["https://game.example.net", "https://play.example.com"],
    ["https://game.e2e-games.test", "https://wrapper.e2e.test"],
    ["https://1.2.3.4", "https://5.6.7.8"],
    ["https://1.2.3.4", "https://2.3.4.5"],
    ["https://3.4.example", "https://1.2.3.4"],
  ])("%s and %s do not", (a, b) => {
    for (const environment of ["production", "preview", "local"] as const) {
      expect(mayShareSite(a, b, environment)).toBe(false);
    }
  });

  it("exempts two loopback hosts in local only", () => {
    const pairs = [
      ["http://localhost:5174", "http://localhost:5173"],
      ["http://127.0.0.1:5174", "http://127.0.0.1:5173"],
      ["http://[::1]:5174", "http://[::1]:5173"],
      ["https://localhost:5174", "http://localhost:5173"],
    ] as const;
    for (const [game, own] of pairs) {
      expect(mayShareSite(game, own, "local")).toBe(false);
      expect(mayShareSite(game, own, "preview")).toBe(true);
      expect(mayShareSite(game, own, "production")).toBe(true);
    }
  });

  it("keys every other host in local as in any environment", () => {
    expect(
      mayShareSite("https://game.localhost", "http://localhost:5173", "local"),
    ).toBe(false);
    expect(
      mayShareSite("https://a.example.com", "https://b.example.com", "local"),
    ).toBe(true);
  });

  it("fails closed for a value that is not a serialized origin", () => {
    for (const value of ["*", "null", "", "https://game.example.net/"]) {
      expect(mayShareSite(value, "https://play.example.com", "local")).toBe(
        true,
      );
      expect(mayShareSite("https://play.example.com", value, "local")).toBe(
        true,
      );
    }
  });
});
