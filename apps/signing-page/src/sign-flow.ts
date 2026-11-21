// One signature through the wallet port (specs/signing-page.md, SP-9): the
// page calls `eth_requestAccounts`, then `eth_signTypedData_v4`. An answer that
// is a string of `0x` and 130 hex digits is the signature, posted as the wallet
// gave it (the shell normalizes and recovers it, W-68). A rejection with
// EIP-1193 code 4001 at either call is `rejected`; any other error, a timeout
// of the provider's own, or an answer of another shape is `wallet-error`. Once
// the wallet has answered, and whenever `eth_requestAccounts` was called, the
// page calls `wallet_revokePermissions` and waits for it at most 3 s on its
// clock, ignoring 4200, any other failure, and the timeout. The wallet's own
// messages are never shown or kept.

import type { PageClock } from "./clock.ts";
import { type FailedReason, isAddress } from "./protocol.ts";
import type { WalletPort } from "./wallet-port.ts";

/** How long the page waits for the revoke (SP-9). */
export const REVOKE_TIMEOUT_MS = 3000;

/** EIP-1193's "user rejected the request". */
const USER_REJECTED = 4001;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/u;

/** What the wallet gave: a signature, or why there is none. */
export type SignOutcome =
  | {
      readonly kind: "result";
      /** The account, in lowercase. */
      readonly wallet: string;
      readonly signature: string;
    }
  | { readonly kind: "failed"; readonly reason: FailedReason };

/** Whether `error` carries EIP-1193 code 4001. Never throws. */
const isUserRejection = (error: unknown): boolean => {
  try {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { readonly code?: unknown }).code === USER_REJECTED
    );
  } catch {
    return false;
  }
};

const failure = (error: unknown): SignOutcome => ({
  kind: "failed",
  reason: isUserRejection(error) ? "rejected" : "wallet-error",
});

const WALLET_ERROR: SignOutcome = { kind: "failed", reason: "wallet-error" };

/** The first account, when it is an address (never the zero address). */
const firstAccount = (accounts: unknown): string | undefined => {
  const [first] = Array.isArray(accounts) ? (accounts as unknown[]) : [];
  return typeof first === "string" && isAddress(first) ? first : undefined;
};

/** Asks the wallet for the account, then for the signature. Never throws. */
export const askWallet = async (
  port: WalletPort,
  typedData: string,
): Promise<SignOutcome> => {
  let accounts: unknown;
  try {
    accounts = await port.requestAccounts();
  } catch (error) {
    return failure(error);
  }
  const account = firstAccount(accounts);
  if (account === undefined) return WALLET_ERROR;
  let signature: unknown;
  try {
    signature = await port.signTypedData(account, typedData);
  } catch (error) {
    return failure(error);
  }
  return typeof signature === "string" && SIGNATURE.test(signature)
    ? { kind: "result", wallet: account.toLowerCase(), signature }
    : WALLET_ERROR;
};

/** The revoke, best effort, given up after 3 s. Never throws. */
export const revokeConnection = async (
  port: WalletPort,
  clock: PageClock,
): Promise<void> => {
  let handle: unknown;
  const timeout = new Promise<void>(resolve => {
    handle = clock.setTimeout(resolve, REVOKE_TIMEOUT_MS);
  });
  const answer = port.revokePermissions().then(
    () => null,
    () => null,
  );
  await Promise.race([answer, timeout]);
  clock.clearTimeout(handle);
};
