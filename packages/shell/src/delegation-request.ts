// What a session's delegation asks the wallet to sign, and the check of its
// answer (W-63, W-67, W-68): the values fixed at the open (the chosen notice,
// the signing page's origin, the session as `bytes32`, and the expiry), the
// `request` built from them, and the registration of a `result` once the
// shell has recovered its signer itself.

import { type Clock, parseDeadline } from "@intraverse/se-client-play-client";
import {
  type Address,
  type Bytes32,
  type KeyDelegationNotice,
  recoverKeyDelegation,
  sameHex,
  sessionIdBytes32,
} from "@intraverse/se-client-signing";

import type { ExpectedDelegation } from "./delegation-check.ts";
import { sessionNotice } from "./delegation-notice.ts";
import {
  DELEGATION_SCHEMA,
  type DelegationRequest,
  type DelegationResult,
} from "./delegation-protocol.ts";
import type { DelegationRefusalCode } from "./delegation-types.ts";

/** The session's delegation inputs, fixed at open. */
export type DelegationInputs = {
  readonly signingPageOrigin: string | undefined;
  readonly acceptPendingNotices: boolean;
  /** The redeem's `sessionId`. */
  readonly sessionId: string;
  /** The redeem's `sessionExpiresAt` (RFC 3339). */
  readonly sessionExpiresAt: string;
  /** The action key's address (EIP-55), drawn at the open (W-9). */
  readonly actionKey: () => Address;
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** The notices document; the vendored one unless a test gives another. */
  readonly notices?: unknown;
};

/** The request's values fixed at the open. */
export type RequestValues = {
  readonly notice: KeyDelegationNotice;
  readonly signingPageOrigin: string;
  readonly sessionId: string;
  readonly sessionBytes32: Bytes32;
  /** Unix seconds: a time, never an amount. */
  readonly expiry: number;
};

const REFUSAL_CODES: ReadonlySet<string> = new Set([
  "KEY_DELEGATION_INVALID",
  "KEY_DELEGATION_EXPIRED",
  "KEY_DELEGATION_NOTICE_UNKNOWN",
]);

/** Whether `code` is one of W-71's three 422 codes. */
export const isRefusalCode = (code: string): code is DelegationRefusalCode =>
  REFUSAL_CODES.has(code);

/**
 * `floor(sessionExpiresAt)` in unix seconds (W-67): the server's instant, never
 * corrected by the clock offset, read with `parseDeadline`; fractional seconds
 * are dropped. A safe integer of at least 1, else `undefined`.
 */
export const expiryOf = (sessionExpiresAt: string): number | undefined => {
  const ms = parseDeadline(sessionExpiresAt);
  if (ms === undefined) return undefined;
  const seconds = Math.floor(ms / 1000);
  return Number.isSafeInteger(seconds) && seconds >= 1 ? seconds : undefined;
};

/**
 * The values fixed at the open, or why nothing is offered: no notice (W-63), or
 * no `signingPageOrigin` or session values a request cannot carry.
 */
export const requestValuesOf = (
  inputs: DelegationInputs,
): RequestValues | "no-notice" | "not-configured" => {
  const notice = sessionNotice(inputs.acceptPendingNotices, inputs.notices);
  if (notice === undefined) return "no-notice";
  const { signingPageOrigin, sessionId } = inputs;
  const expiry = expiryOf(inputs.sessionExpiresAt);
  if (signingPageOrigin === undefined || expiry === undefined) {
    return "not-configured";
  }
  try {
    const sessionBytes32 = sessionIdBytes32(sessionId);
    return { notice, signingPageOrigin, sessionId, sessionBytes32, expiry };
  } catch {
    return "not-configured";
  }
};

/** The one `request` (W-67): nothing but its five fields. */
export const requestOf = (
  values: RequestValues,
  actionKey: Address,
): DelegationRequest =>
  Object.freeze({
    schema: DELEGATION_SCHEMA,
    type: "request",
    actionKey,
    sessionId: values.sessionId,
    expiry: values.expiry,
    noticeId: values.notice.id,
  });

/**
 * W-68: the delegation a `result` registers, or `undefined` when its signature
 * does not recover to its `wallet` (or recovery refuses it). The shell builds
 * the `KeyDelegation` it asked for itself; the wallet's `v` 0 or 1 and a high
 * `s` are normalized, and the canonical signature is what the start sends.
 */
export const registeredOf = (
  result: DelegationResult,
  values: RequestValues,
  actionKey: Address,
): ExpectedDelegation | undefined => {
  try {
    const recovered = recoverKeyDelegation(
      {
        noticeHash: values.notice.noticeHash,
        actionKey,
        sessionId: values.sessionBytes32,
        expiry: values.expiry,
      },
      result.signature,
    );
    if (!sameHex(recovered.wallet, result.wallet)) return undefined;
    return Object.freeze({
      wallet: `0x${result.wallet.slice(2).toLowerCase()}`,
      actionKey,
      sessionId: values.sessionBytes32,
      expiry: values.expiry,
      noticeId: values.notice.id,
      noticeHash: values.notice.noticeHash,
      notice: values.notice.text,
      signature: `0x${recovered.signature.slice(2).toLowerCase()}`,
    });
  } catch {
    // Recovery refused the signature.
    return undefined;
  }
};
