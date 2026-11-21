// T-47: EIP-6963 discovery (SP-8): one `eip6963:requestProvider` after the
// listener is in place; an announcement read only with a string `uuid`, a
// string `name` cut to 64 characters, and a provider with a `request`
// function; de-duplicated by `uuid`, the first kept; nothing else read.

import { describe, expect, it } from "vitest";

import {
  ANNOUNCE_EVENT,
  type AnnouncedWallet,
  discoverWallets,
  readAnnouncement,
  REQUEST_EVENT,
} from "./wallet-discovery.ts";

const provider = { request: () => Promise.resolve(null) };

const announce = (detail: unknown): CustomEvent =>
  new CustomEvent(ANNOUNCE_EVENT, { detail });

const info = (uuid: string, name: string) => ({
  uuid,
  name,
  icon: "data:image/svg+xml,<svg/>",
  rdns: "test.wallet",
});

describe("readAnnouncement (SP-8)", () => {
  it("reads uuid, name, and provider, and never the icon", () => {
    const wallet = readAnnouncement(
      announce({ info: info("u-1", "Wallet One"), provider }),
    );
    expect(wallet).toEqual({ uuid: "u-1", name: "Wallet One", provider });
    expect(Object.keys(wallet as object)).toEqual(["uuid", "name", "provider"]);
  });

  it("cuts a name beyond 64 characters, by character", () => {
    const name = `${"\u{1F60A}".repeat(60)}${"x".repeat(10)}`;
    const wallet = readAnnouncement(
      announce({ info: info("u-1", name), provider }),
    );
    const cut = String(wallet?.name);
    expect(Array.from(cut)).toHaveLength(64);
    expect(cut.startsWith("\u{1F60A}".repeat(60))).toBe(true);
  });

  it.each([
    ["no detail", undefined],
    ["a uuid that is not a string", { info: info("u", "W"), provider: {} }],
    ["no info", { provider }],
    ["a numeric uuid", { info: { uuid: 1, name: "W" }, provider }],
    ["a name that is not a string", { info: { uuid: "u", name: 1 }, provider }],
    ["a provider without request", { info: info("u", "W"), provider: {} }],
    [
      "a request that is not a function",
      { info: info("u", "W"), provider: { request: "x" } },
    ],
  ])("ignores %s", (_name, detail) => {
    expect(readAnnouncement(announce(detail))).toBeUndefined();
  });

  it("ignores an event whose detail throws", () => {
    const detail = {};
    Object.defineProperty(detail, "info", {
      get: () => {
        throw new Error("hostile");
      },
    });
    expect(readAnnouncement(announce(detail))).toBeUndefined();
  });
});

describe("discoverWallets (SP-8)", () => {
  it("listens first, dispatches one request, and de-duplicates by uuid", () => {
    const target = new EventTarget();
    const order: string[] = [];
    target.addEventListener(REQUEST_EVENT, () => {
      order.push("request");
      // A wallet answers the request at once, twice (it announced on load too).
      target.dispatchEvent(announce({ info: info("u-1", "One"), provider }));
      target.dispatchEvent(announce({ info: info("u-1", "Again"), provider }));
    });
    const seen: AnnouncedWallet[] = [];
    const discovery = discoverWallets(target, wallet => {
      seen.push(wallet);
    });
    target.dispatchEvent(announce({ info: info("u-2", "Two"), provider }));
    expect(order).toEqual(["request"]);
    expect(seen.map(wallet => wallet.name)).toEqual(["One", "Two"]);
    expect(discovery.wallets().map(wallet => wallet.uuid)).toEqual([
      "u-1",
      "u-2",
    ]);
  });

  it("stops listening when stopped", () => {
    const target = new EventTarget();
    const discovery = discoverWallets(target, () => null);
    discovery.stop();
    target.dispatchEvent(announce({ info: info("u-1", "One"), provider }));
    expect(discovery.wallets()).toEqual([]);
  });
});
