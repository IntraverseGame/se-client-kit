// Which key-delegation notice the session offers (W-63): read from `contracts`'
// runtime entry (`keyDelegationNotices`, the vendored `key-delegation/v1`
// notices) through `signing`'s reader, never from the network, once, when the
// session opens. The most recent `approved` notice is the last `approved` entry
// in the list's order; only when none is `approved`, and the configuration's
// `acceptPendingNotices` is `true`, the last `pending` one; never a `retired`
// one. A list the reader refuses offers nothing (fail closed).

import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import {
  type KeyDelegationNotice,
  readKeyDelegationNotices,
} from "@intraverse/se-client-signing";

/** The notice the shell offers, as the Wrapper's dialog shows it (W-65). */
export type DelegationNotice = {
  readonly id: string;
  /** The exact text the wallet signs, in English. */
  readonly text: string;
  /** `pending` is marked "Pending legal review" (W-65). */
  readonly status: "pending" | "approved";
};

/** W-63's choice over a list already read, in the list's order. */
export const chooseNotice = (
  notices: readonly KeyDelegationNotice[],
  acceptPendingNotices: boolean,
): KeyDelegationNotice | undefined =>
  notices.findLast(notice => notice.status === "approved") ??
  (acceptPendingNotices
    ? notices.findLast(notice => notice.status === "pending")
    : undefined);

/**
 * The session's notice: W-63's choice over the vendored list, or `undefined`
 * when none is offered or the reader refuses the list. `document` is the
 * vendored list; tests give another.
 */
export const sessionNotice = (
  acceptPendingNotices: boolean,
  document: unknown = keyDelegationNotices,
): KeyDelegationNotice | undefined => {
  try {
    return chooseNotice(
      readKeyDelegationNotices(document),
      acceptPendingNotices,
    );
  } catch {
    // The reader refused the list: nothing is offered.
    return undefined;
  }
};
