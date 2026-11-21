// The `se.delegation/1` message set (W-67, RFC-006): the closed protocol
// between the Wrapper's frame and the signing window it opened, beside
// `se.operator/1` and `se.controller/1`. The signing page sends `ready`, then
// one `result` or `failed`; the Wrapper sends one `request`. A message is read
// only through the own data properties of a plain object with exactly its
// type's fields, each of its type; anything else is not a message. No message
// carries the private key, the play token, the launch code, a round id, or an
// amount. Within `/1` the set and every message's fields are frozen.

import { hasExactly, plainFields } from "./plain-fields.ts";

export const DELEGATION_SCHEMA = "se.delegation/1";

/** How long the shell waits for the window's first `ready` (W-66). */
export const DELEGATION_READY_TIMEOUT_MS = 10_000;

/** How often the shell reads the window's `closed` (W-66). */
export const DELEGATION_CLOSED_POLL_MS = 500;

/** The signing page loaded with an opener and listens. */
export type DelegationReady = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "ready";
};

/** What the wallet is asked to sign (W-67). */
export type DelegationRequest = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "request";
  /** The shell's action key's address, EIP-55. */
  readonly actionKey: string;
  /** The redeem's `sessionId` (`ses_` and 32 hex digits). */
  readonly sessionId: string;
  /** The session's hard end in unix seconds: a time, never an amount. */
  readonly expiry: number;
  /** The id of the notice the shell chose (W-63). */
  readonly noticeId: string;
};

/** The wallet's signature over the requested `KeyDelegation`. */
export type DelegationResult = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "result";
  readonly wallet: string;
  readonly signature: string;
};

/** No signature, with why, from a closed list. */
export type DelegationFailed = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "failed";
  readonly reason:
    | "no-wallet"
    | "rejected"
    | "unknown-notice"
    | "invalid-request"
    | "wallet-error";
};

/** The signing page's one answer to a `request`. */
export type DelegationAnswer = DelegationResult | DelegationFailed;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ZERO_ADDRESS = /^0x0{40}$/u;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/u;
const REASONS: ReadonlySet<string> = new Set([
  "no-wallet",
  "rejected",
  "unknown-notice",
  "invalid-request",
  "wallet-error",
]);

const isReason = (value: unknown): value is DelegationFailed["reason"] =>
  typeof value === "string" && REASONS.has(value);

/** `0x` and 40 hex digits, either case, never the zero address. */
const isAddress = (value: unknown): value is string =>
  typeof value === "string" && ADDRESS.test(value) && !ZERO_ADDRESS.test(value);

/**
 * Whether `data` is a well-formed `ready`: a plain object with exactly `schema`
 * and `type`, read through its own data properties only.
 */
export const isDelegationReady = (data: unknown): boolean => {
  const fields = plainFields(data);
  return (
    fields !== undefined &&
    hasExactly(fields, ["schema", "type"]) &&
    fields.get("schema") === DELEGATION_SCHEMA &&
    fields.get("type") === "ready"
  );
};

/**
 * A well-formed `result` or `failed`, or `undefined` for anything else: another
 * schema or `type`, a missing or extra field, a field of another type or shape
 * (an address that is not `0x` and 40 hex digits or is zero, a signature that
 * is not `0x` and 130 hex digits, a reason off the list), a string, an array.
 */
export const readDelegationAnswer = (
  data: unknown,
): DelegationAnswer | undefined => {
  const fields = plainFields(data);
  if (fields === undefined || fields.get("schema") !== DELEGATION_SCHEMA) {
    return undefined;
  }
  const type = fields.get("type");
  if (type === "result") {
    const wallet = fields.get("wallet");
    const signature = fields.get("signature");
    return hasExactly(fields, ["schema", "type", "wallet", "signature"]) &&
      isAddress(wallet) &&
      typeof signature === "string" &&
      SIGNATURE.test(signature)
      ? Object.freeze({ schema: DELEGATION_SCHEMA, type, wallet, signature })
      : undefined;
  }
  if (type === "failed") {
    const reason = fields.get("reason");
    return hasExactly(fields, ["schema", "type", "reason"]) && isReason(reason)
      ? Object.freeze({ schema: DELEGATION_SCHEMA, type, reason })
      : undefined;
  }
  return undefined;
};
