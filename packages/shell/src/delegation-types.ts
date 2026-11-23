// What the session gives the Wrapper UI of the wallet delegation (W-62 to
// W-71): read-only states and closed codes. No type here holds the signature,
// the session id, or the expiry; only `registered` carries the wallet's
// address, which is public (W-64, W-73).

import type { DelegationNotice } from "./delegation-notice.ts";
import type { DelegationFailed } from "./delegation-protocol.ts";

/**
 * Why a delegation attempt failed (W-69): the window was blocked (`window.open`
 * gave `null`), sent no `ready` within 10 s, answered `failed` with its reason,
 * signed for another wallet than it named (`wallet-mismatch`), or the session
 * ended while it was open.
 */
export type DelegationFailureReason =
  | "blocked"
  | "no-ready"
  | DelegationFailed["reason"]
  | "wallet-mismatch"
  | "session-ended";

/**
 * The handle `window.open` returned for the signing window: the parts of it the
 * shell uses. The platform's `WindowProxy` satisfies it.
 */
export type DelegationWindow = {
  readonly closed: boolean;
  readonly close: () => void;
  readonly focus: () => void;
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
};

/** The parts of a `MessageEvent` the channel reads. */
export type DelegationEvent = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

/**
 * Why a round's delegation check failed (W-72): `mismatch` (a compared field
 * differs), `missing` (a delegation was sent and none was received by the time
 * the round is past `starting`), `unexpected` (none was sent and the first
 * judged read carries one), or `changed` (a later object differs from the
 * first, or one appears on a round started without one after a read past
 * `starting` carried none; handled as a re-issue).
 */
export type DelegationFailure =
  | "mismatch"
  | "missing"
  | "unexpected"
  | "changed";

/** The 422 codes a delegated start may be refused with (W-71). */
export type DelegationRefusalCode =
  | "KEY_DELEGATION_INVALID"
  | "KEY_DELEGATION_EXPIRED"
  | "KEY_DELEGATION_NOTICE_UNKNOWN";

/** The session's delegation state (W-69). */
export type DelegationState =
  /** The session opened; nothing tried yet (or the delegation was dropped). */
  | { readonly state: "offered" }
  /** A signing window is open. */
  | { readonly state: "signing" }
  /** Registered (W-68): every start of the session carries it (W-70). */
  | {
      readonly state: "registered";
      /** The wallet's address, lowercase: public, never logged or stored. */
      readonly wallet: string;
    }
  /** The player closed the window before an answer. */
  | { readonly state: "declined" }
  | { readonly state: "failed"; readonly reason: DelegationFailureReason }
  /**
   * A delegated start was refused with `code` (W-71): the delegation is kept,
   * and a start is refused `delegation-refused` until the player signs again or
   * continues without it.
   */
  | { readonly state: "refused"; readonly code: DelegationRefusalCode };

/** Whether the shell offers the menu item (W-64's first two conditions). */
export type DelegationOffer =
  | { readonly kind: "offered"; readonly notice: DelegationNotice }
  | {
      readonly kind: "not-offered";
      /**
       * The first condition that fails: no notice to offer, no
       * `signingPageOrigin` (or the session's values cannot form a request),
       * the session ended, a window open or a delegation registered, a book
       * game, or a round open.
       */
      readonly reason:
        | "no-notice"
        | "not-configured"
        | "ended"
        | "in-progress"
        | "book"
        | "round-open";
    };

/** The answer to `beginDelegation` (W-66). */
export type DelegationBegin =
  /** The attempt began; its outcome is the state's (`null` is `blocked`). */
  | { readonly kind: "started" }
  /** Nothing was begun, the given window closed, nothing posted to it. */
  | {
      readonly kind: "refused";
      readonly reason: "busy" | "not-offered" | "session-ended";
    };
