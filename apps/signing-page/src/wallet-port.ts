// The wallet port (specs/signing-page.md, SP-9): the only code that calls a
// provider's `request`, and only with its allow-list:
// - `eth_requestAccounts`, with no params;
// - `eth_signTypedData_v4`, only as `[account, typedData]`, where `account` is
//   the first account `eth_requestAccounts` returned and `typedData` is the
//   JSON text the port was made for, compared before the call with exactly the
//   `KeyDelegation` primary type, the chainless domain (`name` and `version`
//   only), and the four-field type;
// - `wallet_revokePermissions`, only with `[{ eth_accounts: {} }]`.
// Any other method, or one of these with other params, throws before it
// reaches the provider. An account that is not `0x` and 40 hex digits, or is
// the zero address, is never recorded as connected, so no signature can be
// asked for it.

import { isAddress } from "./protocol.ts";

/** An injected EIP-1193 provider, as EIP-6963 announces it. */
export type Eip1193Provider = {
  readonly request: (args: {
    readonly method: string;
    readonly params?: unknown;
  }) => Promise<unknown>;
};

export type WalletPort = {
  /** The guarded call every method below goes through. */
  readonly call: (method: string, params?: unknown) => Promise<unknown>;
  readonly requestAccounts: () => Promise<unknown>;
  readonly signTypedData: (
    account: string,
    typedData: string,
  ) => Promise<unknown>;
  readonly revokePermissions: () => Promise<unknown>;
};

/** A call the allow-list refuses; it never reached the provider. */
export class WalletPortRefusal extends Error {
  constructor(method: string) {
    super(`The wallet port refuses ${method}.`);
    this.name = "WalletPortRefusal";
  }
}

const REQUEST_ACCOUNTS = "eth_requestAccounts";
const SIGN_TYPED_DATA = "eth_signTypedData_v4";
const REVOKE_PERMISSIONS = "wallet_revokePermissions";

const DOMAIN_TYPE = JSON.stringify([
  { name: "name", type: "string" },
  { name: "version", type: "string" },
]);
const KEY_DELEGATION_TYPE = JSON.stringify([
  { name: "notice", type: "string" },
  { name: "actionKey", type: "address" },
  { name: "sessionId", type: "bytes32" },
  { name: "expiry", type: "uint64" },
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactly = (
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): boolean => {
  const keys = Object.keys(value);
  return (
    keys.length === names.length && names.every(name => keys.includes(name))
  );
};

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** The primary type, the chainless domain, and the four-field type. */
const isKeyDelegationShape = (typedData: unknown): boolean => {
  if (
    !isRecord(typedData) ||
    !hasExactly(typedData, ["types", "primaryType", "domain", "message"])
  ) {
    return false;
  }
  const { types, primaryType, domain } = typedData;
  return (
    primaryType === "KeyDelegation" &&
    isRecord(domain) &&
    hasExactly(domain, ["name", "version"]) &&
    isRecord(types) &&
    hasExactly(types, ["EIP712Domain", "KeyDelegation"]) &&
    JSON.stringify(types["EIP712Domain"]) === DOMAIN_TYPE &&
    JSON.stringify(types["KeyDelegation"]) === KEY_DELEGATION_TYPE
  );
};

const isRevokeParams = (params: unknown): boolean =>
  Array.isArray(params) &&
  params.length === 1 &&
  isRecord(params[0]) &&
  hasExactly(params[0], ["eth_accounts"]) &&
  isRecord(params[0]["eth_accounts"]) &&
  Object.keys(params[0]["eth_accounts"]).length === 0;

/**
 * The port for one provider and one signature: `expectedTypedData` is the JSON
 * text of `signing`'s `keyDelegationTypedData` for the request.
 */
export const createWalletPort = (
  provider: Eip1193Provider,
  expectedTypedData: string,
): WalletPort => {
  let connected: string | undefined;
  const allowed = (method: string, params: unknown): boolean => {
    if (method === REQUEST_ACCOUNTS) return params === undefined;
    if (method === REVOKE_PERMISSIONS) return isRevokeParams(params);
    if (method !== SIGN_TYPED_DATA || !Array.isArray(params)) return false;
    const [account, typedData] = params as readonly unknown[];
    return (
      params.length === 2 &&
      connected !== undefined &&
      account === connected &&
      typeof typedData === "string" &&
      typedData === expectedTypedData &&
      isKeyDelegationShape(parse(typedData))
    );
  };
  const call = async (method: string, params?: unknown): Promise<unknown> => {
    if (!allowed(method, params)) throw new WalletPortRefusal(method);
    return await (params === undefined
      ? provider.request({ method })
      : provider.request({ method, params }));
  };
  return Object.freeze({
    call,
    requestAccounts: async () => {
      const accounts = await call(REQUEST_ACCOUNTS);
      const [first] = Array.isArray(accounts) ? (accounts as unknown[]) : [];
      connected =
        typeof first === "string" && isAddress(first) ? first : undefined;
      return accounts;
    },
    signTypedData: (account: string, typedData: string) =>
      call(SIGN_TYPED_DATA, [account, typedData]),
    revokePermissions: () => call(REVOKE_PERMISSIONS, [{ eth_accounts: {} }]),
  });
};
