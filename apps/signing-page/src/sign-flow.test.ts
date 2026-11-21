// T-47: one signature through the port (SP-9): 4001 at either call is
// `rejected`; any other error or a malformed answer is `wallet-error`; the
// signature is passed on as the wallet gave it, with the account in lowercase;
// the revoke is asked with `[{ eth_accounts: {} }]` and given up after 3 s on
// the page's clock, and 4200 and other failures are ignored.

import { describe, expect, it } from "vitest";

import { acceptedVector } from "./fixtures/accepted-vector.ts";
import { fakeClock, settle } from "./fixtures/fake-clock.ts";
import {
  providerError,
  type ScriptedAnswer,
  stubWallet,
} from "./fixtures/stub-wallet.ts";
import { askWallet, REVOKE_TIMEOUT_MS, revokeConnection } from "./sign-flow.ts";
import { createWalletPort } from "./wallet-port.ts";

const vector = acceptedVector();
const TYPED = '{"stand-in":true}';
const MIXED = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const SIGNATURE = `0x${"ab".repeat(65)}`;

const ask = async (script: Readonly<Record<string, ScriptedAnswer>>) => {
  const provider = stubWallet(script);
  // The port's typed-data check is the port's test; here the port is made for
  // the stand-in text, which is not a KeyDelegation, so a signature is asked
  // through a port that accepts it.
  const port = createWalletPort(provider, TYPED);
  const passing = {
    ...port,
    signTypedData: (account: string, typedData: string) =>
      provider.request({
        method: "eth_signTypedData_v4",
        params: [account, typedData],
      }),
  };
  return { outcome: await askWallet(passing, TYPED), provider };
};

describe("askWallet (SP-9)", () => {
  it("gives the signature as the wallet gave it, the account in lowercase", async () => {
    const { outcome, provider } = await ask({
      eth_requestAccounts: { value: [MIXED, vector.wallet] },
      eth_signTypedData_v4: {
        value: SIGNATURE.toUpperCase().replace("0X", "0x"),
      },
    });
    expect(outcome).toEqual({
      kind: "result",
      wallet: MIXED.toLowerCase(),
      signature: SIGNATURE.toUpperCase().replace("0X", "0x"),
    });
    expect(provider.calls).toEqual([
      { method: "eth_requestAccounts" },
      { method: "eth_signTypedData_v4", params: [MIXED, TYPED] },
    ]);
  });

  it.each([
    [
      "at eth_requestAccounts",
      { eth_requestAccounts: { error: providerError(4001) } },
    ],
    [
      "at eth_signTypedData_v4",
      {
        eth_requestAccounts: { value: [MIXED] },
        eth_signTypedData_v4: { error: providerError(4001) },
      },
    ],
  ])("is rejected on 4001 %s", async (_name, script) => {
    expect((await ask(script)).outcome).toEqual({
      kind: "failed",
      reason: "rejected",
    });
  });

  it.each([
    [
      "an error without code",
      { eth_requestAccounts: { error: new Error("x") } },
    ],
    ["-32002", { eth_requestAccounts: { error: providerError(-32002) } }],
    [
      "a code as a string",
      { eth_requestAccounts: { error: { code: "4001" } } },
    ],
    ["no accounts", { eth_requestAccounts: { value: [] } }],
    [
      "an account that is not an address",
      { eth_requestAccounts: { value: ["0x12"] } },
    ],
    [
      "the zero address",
      { eth_requestAccounts: { value: [`0x${"0".repeat(40)}`] } },
    ],
    ["accounts that are not a list", { eth_requestAccounts: { value: MIXED } }],
    [
      "a short signature",
      {
        eth_requestAccounts: { value: [MIXED] },
        eth_signTypedData_v4: { value: `0x${"ab".repeat(64)}` },
      },
    ],
    [
      "a signature that is not a string",
      {
        eth_requestAccounts: { value: [MIXED] },
        eth_signTypedData_v4: { value: { r: "0x", s: "0x" } },
      },
    ],
    [
      "another error at the signature",
      {
        eth_requestAccounts: { value: [MIXED] },
        eth_signTypedData_v4: { error: providerError(-32603) },
      },
    ],
  ])("is wallet-error on %s", async (_name, script) => {
    expect((await ask(script)).outcome).toEqual({
      kind: "failed",
      reason: "wallet-error",
    });
  });
});

describe("revokeConnection (SP-9)", () => {
  it("asks wallet_revokePermissions with [{ eth_accounts: {} }] and waits for it", async () => {
    const clock = fakeClock();
    const provider = stubWallet({ wallet_revokePermissions: { value: null } });
    await revokeConnection(createWalletPort(provider, TYPED), clock);
    expect(provider.calls).toEqual([
      { method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] },
    ]);
    expect(clock.pending()).toEqual([]);
  });

  it.each([
    ["4200", { error: providerError(4200) }],
    ["another failure", { error: new Error("x") }],
  ])("ignores %s", async (_name, answer: ScriptedAnswer) => {
    const provider = stubWallet({ wallet_revokePermissions: answer });
    await expect(
      revokeConnection(createWalletPort(provider, TYPED), fakeClock()),
    ).resolves.toBeUndefined();
  });

  it("gives up after 3 s on the page's clock", async () => {
    const clock = fakeClock();
    const provider = stubWallet({ wallet_revokePermissions: { hang: true } });
    let done = false;
    const revoking = revokeConnection(
      createWalletPort(provider, TYPED),
      clock,
    ).then(() => {
      done = true;
      return done;
    });
    await settle();
    expect(clock.pending()).toEqual([REVOKE_TIMEOUT_MS]);
    await clock.advance(REVOKE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await clock.advance(1);
    await revoking;
    expect(done).toBe(true);
    expect(REVOKE_TIMEOUT_MS).toBe(3000);
  });
});
