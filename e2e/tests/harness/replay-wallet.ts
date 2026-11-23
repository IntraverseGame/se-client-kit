// The replay wallet (T-50): an EIP-6963 announcement on the signing page's
// origin only, from an init script, of a provider that holds no key. It
// answers `eth_requestAccounts` with the vendored accepted vector's `wallet`,
// checks that `eth_signTypedData_v4` is asked for exactly that vector's
// `typedData` by that account (the action key compared without case and the
// expiry as a decimal: the vector spells them in lowercase and as a number, the
// page sends EIP-55 and a string, which encode alike), and answers the vector's
// signature; `wallet_revokePermissions` answers `null`. Any other call, or
// another typed data, is an error, which the page reports as `wallet-error`.
// Each call is recorded in the page's `seWalletCalls`. With `hold`, the
// signature or the revoke waits until the test calls `seReleaseWallet()`.
//
// The vector is read at run time from `contracts`' test-only entry; it holds
// no key (the wallet's signature is the vector's own).

import { keyDelegationVectors } from "@intraverse/se-client-contracts/testing";
import type { BrowserContext } from "@playwright/test";

import { SIGNER_ORIGIN } from "./origins.ts";

/** The accepted vector's request and answer, as the test compares them. */
export type DelegationVector = {
  readonly wallet: string;
  readonly signature: string;
  readonly typedData: unknown;
  readonly sessionId: string;
  readonly actionKey: string;
  readonly expiry: number;
  readonly noticeHash: string;
  readonly noticeId: string;
};

const recordAt = (value: unknown, where: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`key-delegation/v1: ${where} is not an object`);
  }
  return value as Record<string, unknown>;
};

const stringAt = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError(`key-delegation/v1: ${key} is not a string`);
  }
  return value;
};

/** The vendored accepted vector. */
export const delegationVector = (): DelegationVector => {
  const file = recordAt(keyDelegationVectors.v1, "the file");
  const [accepted] = file["accepted"] as unknown[];
  const vector = recordAt(accepted, "accepted[0]");
  const start = recordAt(vector["start"], "start");
  const body = recordAt(vector["keyDelegation"], "keyDelegation");
  return {
    wallet: stringAt(body, "wallet"),
    signature: stringAt(body, "signature"),
    noticeHash: stringAt(body, "noticeHash"),
    expiry: Number(body["expiry"]),
    typedData: vector["typedData"],
    sessionId: stringAt(start, "sessionId"),
    actionKey: stringAt(start, "actionKey"),
    noticeId: stringAt(vector, "noticeId"),
  };
};

/** What the replay wallet holds back until the test releases it. */
export type WalletHold = "none" | "signature" | "revoke";

type WalletArgs = {
  readonly origin: string;
  readonly wallet: string;
  readonly signature: string;
  readonly typedData: unknown;
  readonly hold: WalletHold;
};

/** Announces the replay wallet on every page of `SIGNER_ORIGIN`. */
export const replayWallet = async (
  context: BrowserContext,
  hold: WalletHold = "none",
): Promise<void> => {
  const vector = delegationVector();
  const args: WalletArgs = {
    origin: SIGNER_ORIGIN,
    wallet: vector.wallet,
    signature: vector.signature,
    typedData: vector.typedData,
    hold,
  };
  await context.addInitScript((given: WalletArgs) => {
    if (location.origin !== given.origin) return;
    const calls: unknown[] = [];
    Object.defineProperty(globalThis, "seWalletCalls", { value: calls });
    // `seReleaseWallet()` lets a held signature or revoke answer.
    const held = new Promise<void>(resolve => {
      Object.defineProperty(globalThis, "seReleaseWallet", { value: resolve });
    });
    const expected = given.typedData as {
      readonly message: Record<string, unknown>;
    };
    const isVector = (text: unknown): boolean => {
      if (typeof text !== "string") return false;
      const asked = JSON.parse(text) as typeof expected;
      const { message, ...rest } = asked;
      const { message: want, ...wantRest } = expected;
      return (
        JSON.stringify(rest) === JSON.stringify(wantRest) &&
        message["notice"] === want["notice"] &&
        message["sessionId"] === want["sessionId"] &&
        String(message["actionKey"]).toLowerCase() ===
          String(want["actionKey"]).toLowerCase() &&
        message["expiry"] === String(want["expiry"]) &&
        Object.keys(message).length === 4
      );
    };
    const request = async (call: {
      readonly method: string;
      readonly params?: unknown;
    }): Promise<unknown> => {
      calls.push({ method: call.method, params: call.params });
      const params = (call.params ?? []) as readonly unknown[];
      switch (call.method) {
        case "eth_requestAccounts": {
          return [given.wallet];
        }
        case "eth_signTypedData_v4": {
          if (params[0] !== given.wallet || !isVector(params[1])) {
            throw Object.assign(new Error("replay wallet"), { code: -32602 });
          }
          if (given.hold === "signature") await held;
          return given.signature;
        }
        case "wallet_revokePermissions": {
          if (given.hold === "revoke") await held;
          return null;
        }
        default: {
          throw Object.assign(new Error("replay wallet"), { code: 4200 });
        }
      }
    };
    const detail = Object.freeze({
      info: Object.freeze({
        uuid: "5f0b6a0e-0000-4000-8000-0000000000e2",
        name: "Replay Wallet",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
        rdns: "test.e2e.replay-wallet",
      }),
      provider: Object.freeze({ request }),
    });
    const announce = (): void => {
      globalThis.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", { detail }),
      );
    };
    globalThis.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, args);
};
