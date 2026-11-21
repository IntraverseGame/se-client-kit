// T-47: the wallet port's allow-list (SP-9). The zero-call test: a stub
// provider records zero calls for every method off the list, and for an
// `eth_signTypedData_v4` call with another primary type, another domain (one
// with a `chainId` included), another account, or another type, each of which
// throws before the provider. The typed data the page sends equals the
// vendored accepted vector's `typedData` for its inputs.

import {
  keyDelegationTypedData,
  sessionIdBytes32,
} from "@intraverse/se-client-signing";
import { describe, expect, it } from "vitest";

import { acceptedVector } from "./fixtures/accepted-vector.ts";
import { stubWallet } from "./fixtures/stub-wallet.ts";
import { findNotice } from "./notice.ts";
import { createWalletPort, WalletPortRefusal } from "./wallet-port.ts";

const vector = acceptedVector();
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/** The page's typed data for the vector's request, as it builds it. */
const typedDataObject = () => {
  const notice = findNotice(vector.request.noticeId, true);
  if (notice === undefined) throw new Error("the vendored notice is missing");
  return keyDelegationTypedData({
    notice: notice.text,
    actionKey: vector.request.actionKey as `0x${string}`,
    sessionId: sessionIdBytes32(vector.request.sessionId),
    expiry: vector.request.expiry,
  });
};
const TYPED_DATA = JSON.stringify(typedDataObject());

/** A port whose wallet has connected `vector.wallet`. */
const connectedPort = async (expected = TYPED_DATA) => {
  const provider = stubWallet({
    eth_requestAccounts: { value: [vector.wallet] },
    eth_signTypedData_v4: { value: vector.signature },
    wallet_revokePermissions: { value: null },
  });
  const port = createWalletPort(provider, expected);
  await port.requestAccounts();
  provider.calls.length = 0;
  return { provider, port };
};

const variant = (change: (value: Record<string, unknown>) => void): string => {
  const value = structuredClone(typedDataObject()) as Record<string, unknown>;
  change(value);
  return JSON.stringify(value);
};

describe("the typed data (SP-9)", () => {
  it("equals the vendored accepted vector's typedData for its inputs", () => {
    // The vector spells the action key in lowercase and the expiry as a JSON
    // number; the page sends EIP-55 and a decimal string, which encode alike
    // (signing's own vector test, T-51).
    const given = vector.typedData as {
      readonly message: Readonly<Record<string, unknown>>;
    };
    const sent = JSON.parse(TYPED_DATA) as typeof given;
    expect({ ...sent, message: undefined }).toEqual({
      ...given,
      message: undefined,
    });
    const lower = String(given.message["actionKey"]).toLowerCase();
    expect({ ...sent.message, actionKey: lower }).toEqual({
      ...given.message,
      actionKey: lower,
      expiry: String(given.message["expiry"]),
    });
    // EIP-55: the same address, in mixed case.
    expect(String(sent.message["actionKey"]).toLowerCase()).toBe(lower);
    expect(sent.message["actionKey"]).not.toBe(lower);
  });
});

describe("the wallet port's allow-list (SP-9)", () => {
  it("passes the three allowed calls through, exactly", async () => {
    const { provider, port } = await connectedPort();
    await port.signTypedData(vector.wallet, TYPED_DATA);
    await port.revokePermissions();
    expect(provider.calls).toEqual([
      { method: "eth_signTypedData_v4", params: [vector.wallet, TYPED_DATA] },
      { method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] },
    ]);
  });

  it("asks eth_requestAccounts with no params", async () => {
    const provider = stubWallet({ eth_requestAccounts: { value: [] } });
    await createWalletPort(provider, TYPED_DATA).requestAccounts();
    expect(provider.calls).toEqual([{ method: "eth_requestAccounts" }]);
  });

  it.each([
    ["eth_sendTransaction", [{ to: OTHER, value: "0x1" }]],
    ["personal_sign", ["0x00", OTHER]],
    ["eth_sign", [OTHER, "0x00"]],
    ["eth_signTypedData_v3", [OTHER, TYPED_DATA]],
    ["wallet_switchEthereumChain", [{ chainId: "0x1" }]],
    ["eth_accounts", undefined],
    ["eth_requestAccounts", []],
    ["wallet_revokePermissions", [{ eth_accounts: {}, other: {} }]],
    ["wallet_revokePermissions", [{ eth_accounts: { x: 1 } }]],
    ["wallet_revokePermissions", undefined],
    ["wallet_requestPermissions", [{ eth_accounts: {} }]],
  ])("refuses %s %j with zero calls", async (method, params) => {
    const { provider, port } = await connectedPort();
    await expect(port.call(method, params)).rejects.toBeInstanceOf(
      WalletPortRefusal,
    );
    expect(provider.calls).toEqual([]);
  });

  it.each([
    [
      "another primary type",
      variant(value => {
        value["primaryType"] = "Permit";
      }),
    ],
    [
      "a domain with a chainId",
      variant(value => {
        value["domain"] = { ...(value["domain"] as object), chainId: 1 };
      }),
    ],
    [
      "another type",
      variant(value => {
        (value["types"] as Record<string, unknown>)["KeyDelegation"] = [
          { name: "notice", type: "string" },
        ];
      }),
    ],
    [
      "another message",
      variant(value => {
        (value["message"] as Record<string, unknown>)["expiry"] = "1";
      }),
    ],
    ["text that is not JSON", "{"],
  ])(
    "refuses eth_signTypedData_v4 with %s, zero calls",
    async (_name, text) => {
      const { provider, port } = await connectedPort();
      await expect(
        port.signTypedData(vector.wallet, text),
      ).rejects.toBeInstanceOf(WalletPortRefusal);
      await expect(
        port.call("eth_signTypedData_v4", [vector.wallet, text]),
      ).rejects.toBeInstanceOf(WalletPortRefusal);
      expect(provider.calls).toEqual([]);
    },
  );

  it("refuses the shape itself, even when the port was made for it", async () => {
    const chained = variant(value => {
      value["domain"] = { ...(value["domain"] as object), chainId: 1 };
    });
    const { provider, port } = await connectedPort(chained);
    await expect(port.signTypedData(vector.wallet, chained)).rejects.toThrow(
      WalletPortRefusal,
    );
    expect(provider.calls).toEqual([]);
  });

  it.each([
    ["the zero address", `0x${"0".repeat(40)}`],
    ["an account off the address shape", "0x1234"],
  ])("never takes %s as the connected account", async (_name, account) => {
    const provider = stubWallet({
      eth_requestAccounts: { value: [account] },
      eth_signTypedData_v4: { value: vector.signature },
    });
    const port = createWalletPort(provider, TYPED_DATA);
    await port.requestAccounts();
    provider.calls.length = 0;
    await expect(port.signTypedData(account, TYPED_DATA)).rejects.toThrow(
      WalletPortRefusal,
    );
    expect(provider.calls).toEqual([]);
  });

  it("refuses another account, or a signature before any account", async () => {
    const { provider, port } = await connectedPort();
    await expect(port.signTypedData(OTHER, TYPED_DATA)).rejects.toThrow(
      WalletPortRefusal,
    );
    await expect(
      port.call("eth_signTypedData_v4", [vector.wallet, TYPED_DATA, "extra"]),
    ).rejects.toThrow(WalletPortRefusal);
    expect(provider.calls).toEqual([]);
    const fresh = stubWallet({});
    await expect(
      createWalletPort(fresh, TYPED_DATA).signTypedData(
        vector.wallet,
        TYPED_DATA,
      ),
    ).rejects.toThrow(WalletPortRefusal);
    expect(fresh.calls).toEqual([]);
  });
});
