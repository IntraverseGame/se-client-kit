// @vitest-environment jsdom
// T-47, the page with a wallet (SP-8 to SP-11): none announced in 1 s is
// `no-wallet`; wallets listed by name in the order announced, a later one
// added; the notice's exact text marked while `pending`, the expiry as a date
// and time; one wallet at a time (every button disabled once one is picked);
// the vector's signature replayed and posted with the wallet in lowercase; the
// revoke before every answer after `eth_requestAccounts`, given up after 3 s;
// the answer only to the fixed origin, then the opener dropped, then the
// window closed by the page.

import { describe, expect, it } from "vitest";

import { acceptedVector } from "./fixtures/accepted-vector.ts";
import { settle } from "./fixtures/fake-clock.ts";
import {
  ANSWERED,
  headingOf,
  type TestHost,
  testHost,
  walletButtons,
  WRAPPER_ORIGIN,
} from "./fixtures/page-host.ts";
import {
  providerError,
  type ScriptedAnswer,
  stubWallet,
} from "./fixtures/stub-wallet.ts";
import { formatExpiry, TEXT } from "./messages.ts";
import { findNotice } from "./notice.ts";
import { REVOKE_TIMEOUT_MS } from "./sign-flow.ts";
import { DISCOVERY_WAIT_MS, runSigningPage } from "./signing-page.ts";
import { REQUEST_EVENT } from "./wallet-discovery.ts";

const vector = acceptedVector();
const REQUEST = {
  schema: "se.delegation/1",
  type: "request",
  ...vector.request,
};
const NOTICE = findNotice(vector.request.noticeId, true);

const REPLAY: Readonly<Record<string, ScriptedAnswer>> = {
  eth_requestAccounts: { value: [vector.wallet] },
  eth_signTypedData_v4: { value: vector.signature },
  wallet_revokePermissions: { value: null },
};

/** The page asked by the vector's request, with `announce` run on request. */
const requested = async (
  announce: (host: TestHost) => void = () => null,
): Promise<TestHost> => {
  const host = testHost();
  host.events.addEventListener(REQUEST_EVENT, () => {
    announce(host);
  });
  void runSigningPage(host);
  await settle();
  host.send(REQUEST);
  await settle();
  return host;
};

/** The page listing `wallets`, after discovery's wait. */
const listing = async (
  ...wallets: readonly (readonly [string, ReturnType<typeof stubWallet>])[]
): Promise<TestHost> => {
  const host = await requested(page => {
    for (const [name, provider] of wallets) page.announce(name, name, provider);
  });
  await host.clock.advance(DISCOVERY_WAIT_MS);
  return host;
};

const answers = (host: TestHost) => host.opener.posted.slice(2);

describe("discovery (SP-8)", () => {
  it("answers no-wallet when none is announced within 1 s", async () => {
    const host = await requested();
    expect(headingOf(host)).toBe(TEXT.discovering);
    await host.clock.advance(DISCOVERY_WAIT_MS - 1);
    expect(answers(host)).toEqual([]);
    await host.clock.advance(1);
    expect(answers(host)).toEqual([
      {
        message: {
          schema: "se.delegation/1",
          type: "failed",
          reason: "no-wallet",
        },
        origin: WRAPPER_ORIGIN,
      },
    ]);
    expect(host.drops).toEqual([3]);
    expect(host.steps).toEqual(ANSWERED);
  });

  it("lists the wallets by name, in order, and adds one announced later", async () => {
    const host = await listing(
      ["Wallet B", stubWallet(REPLAY)],
      ["Wallet A", stubWallet(REPLAY)],
    );
    expect(walletButtons(host).map(button => button.textContent)).toEqual([
      "Wallet B",
      "Wallet A",
    ]);
    const heading = host.root.querySelector("h1");
    expect(document.activeElement).toBe(heading);
    host.announce("late", "Wallet C", stubWallet(REPLAY));
    expect(walletButtons(host).map(button => button.textContent)).toEqual([
      "Wallet B",
      "Wallet A",
      "Wallet C",
    ]);
    expect(document.activeElement).toBe(heading);
    expect(walletButtons(host).every(button => !button.disabled)).toBe(true);
    expect(walletButtons(host).every(button => button.type === "button")).toBe(
      true,
    );
  });
});

describe("the choose state (SP-10, SP-11)", () => {
  it("shows the heading, the exact notice marked pending, the expiry, and the texts", async () => {
    const host = await listing(["Wallet", stubWallet(REPLAY)]);
    const text = String(host.root.textContent);
    expect(headingOf(host)).toBe(TEXT.chooseHeading);
    expect(host.root.querySelector(".sp-notice")?.textContent).toBe(
      NOTICE?.text,
    );
    expect(host.root.querySelector(".sp-mark")?.textContent).toBe(TEXT.pending);
    expect(text).toContain(TEXT.signThis);
    expect(text).toContain(
      TEXT.lastsUntil(formatExpiry(vector.request.expiry)),
    );
    expect(text).not.toContain(String(vector.request.expiry));
    expect(text).toContain(TEXT.networkName);
    expect(text).toContain(TEXT.chooseWallet);
    const live = host.root.querySelector("[aria-live]");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.contains(host.root.querySelector("h1"))).toBe(true);
  });
});

describe("one signature (SP-8, SP-9)", () => {
  it("disables every button once one is picked, then answers the vector's result", async () => {
    const chosen = stubWallet(REPLAY);
    const other = stubWallet(REPLAY);
    const host = await listing(["Chosen", chosen], ["Other", other]);
    const [first, second] = walletButtons(host);
    first?.click();
    expect(walletButtons(host).every(button => button.disabled)).toBe(true);
    expect(host.root.querySelector("[aria-live]")?.textContent).toContain(
      TEXT.confirmInWallet,
    );
    second?.click();
    walletButtons(host)[0]?.click();
    await settle();
    await host.clock.advance(0);
    expect(other.calls).toEqual([]);
    expect(chosen.calls.map(call => call.method)).toEqual([
      "eth_requestAccounts",
      "eth_signTypedData_v4",
      "wallet_revokePermissions",
    ]);
    const [, signCall] = chosen.calls;
    expect(signCall?.params).toEqual([vector.wallet, expect.any(String)]);
    expect(answers(host)).toEqual([
      {
        message: {
          schema: "se.delegation/1",
          type: "result",
          wallet: vector.wallet.toLowerCase(),
          signature: vector.signature,
        },
        origin: WRAPPER_ORIGIN,
      },
    ]);
    expect(host.drops).toEqual([3]);
    expect(host.steps).toEqual(ANSWERED);
    expect(headingOf(host)).toBe(TEXT.finishing);
  });

  it("revokes before it answers: a hanging revoke delays the answer 3 s", async () => {
    const wallet = stubWallet({
      ...REPLAY,
      wallet_revokePermissions: { hang: true },
    });
    const host = await listing(["Wallet", wallet]);
    walletButtons(host)[0]?.click();
    await settle();
    expect(headingOf(host)).toBe(TEXT.finishing);
    expect(answers(host)).toEqual([]);
    await host.clock.advance(REVOKE_TIMEOUT_MS - 1);
    expect(answers(host)).toEqual([]);
    await host.clock.advance(1);
    expect(answers(host)).toHaveLength(1);
  });

  it.each([
    ["rejected", { eth_requestAccounts: { error: providerError(4001) } }],
    [
      "rejected",
      {
        eth_requestAccounts: { value: [vector.wallet] },
        eth_signTypedData_v4: { error: providerError(4001) },
      },
    ],
    [
      "wallet-error",
      {
        eth_requestAccounts: { value: [vector.wallet] },
        eth_signTypedData_v4: { value: "0x1234" },
      },
    ],
  ])("answers %s after the revoke", async (reason, script) => {
    const wallet = stubWallet({
      ...script,
      wallet_revokePermissions: { error: providerError(4200) },
    });
    const host = await listing(["Wallet", wallet]);
    walletButtons(host)[0]?.click();
    await settle();
    await host.clock.advance(0);
    expect(wallet.calls.at(-1)?.method).toBe("wallet_revokePermissions");
    expect(answers(host)).toEqual([
      {
        message: { schema: "se.delegation/1", type: "failed", reason },
        origin: WRAPPER_ORIGIN,
      },
    ]);
    expect(host.drops).toEqual([3]);
    expect(host.steps).toEqual(ANSWERED);
  });
});
