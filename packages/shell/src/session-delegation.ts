// The session's wallet delegation (W-62 to W-71, RFC-006): which notice it
// offers (chosen once, at the open, delegation-notice.ts), the signing window's
// wait (delegation-channel.ts), the check of the wallet's answer and its
// registration in memory only (W-68, delegation-request.ts), the delegation
// every start carries while it is registered (W-70), and a delegated start's
// 422 refusal (W-71). Nothing here is stored, and it logs nothing (W-73): no
// state or answer carries the signature, the session id, or the expiry; only
// `registered` carries the wallet's address.

import type { Address } from "@intraverse/se-client-signing";

import {
  type DelegationChannel,
  type DelegationChannelEnd,
  openDelegationChannel,
} from "./delegation-channel.ts";
import type { ExpectedDelegation } from "./delegation-check.ts";
import {
  type DelegationInputs,
  isRefusalCode,
  registeredOf,
  type RequestValues,
  requestOf,
  requestValuesOf,
} from "./delegation-request.ts";
import type {
  DelegationBegin,
  DelegationEvent,
  DelegationOffer,
  DelegationRefusalCode,
  DelegationState,
  DelegationWindow,
} from "./delegation-types.ts";

/** What the session reads of itself for the offer (W-64). */
export type DelegationHost = {
  readonly ended: () => boolean;
  /** Whether the latest Snapshot the session read is `playback`. */
  readonly playback: () => boolean;
  /** Whether a `start` would be refused `round-exists`. */
  readonly roundOpen: () => boolean;
};

/** The use case's members the UI gets, on the session (W-62 to W-71). */
export type DelegationUseCase = {
  readonly delegation: () => DelegationState;
  readonly delegationOffer: () => DelegationOffer;
  readonly beginDelegation: (
    handle: DelegationWindow | null,
  ) => DelegationBegin;
  readonly receiveDelegation: (event: DelegationEvent) => void;
  readonly dropDelegation: () => void;
  readonly onDelegation: (
    listener: (state: DelegationState) => void,
  ) => () => void;
};

export type SessionDelegation = {
  readonly useCase: DelegationUseCase;
  /** The registered delegation a start carries now, if any (W-70). */
  readonly carried: () => ExpectedDelegation | undefined;
  /**
   * Whether a start is refused `delegation-refused` (W-71): while `refused`,
   * and while a "Sign again" attempt begun from `refused` is open.
   */
  readonly refusesStart: () => boolean;
  /** A start that carried `sent` was answered `status` with `code` (W-71). */
  readonly startRefused: (
    sent: ExpectedDelegation,
    status: number,
    code: string,
  ) => void;
  /** The session ended: the window closes, the delegation is forgotten. */
  readonly end: () => void;
};

const OFFERED: DelegationState = Object.freeze({ state: "offered" });
const SIGNING: DelegationState = Object.freeze({ state: "signing" });
const DECLINED: DelegationState = Object.freeze({ state: "declined" });
const STARTED: DelegationBegin = Object.freeze({ kind: "started" });

const failedState = (
  reason: Extract<DelegationState, { state: "failed" }>["reason"],
): DelegationState => Object.freeze({ state: "failed", reason });

const not = (
  reason: Extract<DelegationOffer, { kind: "not-offered" }>["reason"],
): DelegationOffer => Object.freeze({ kind: "not-offered", reason });

const closeQuietly = (handle: DelegationWindow): void => {
  try {
    handle.close();
  } catch {
    // A window that is gone cannot be closed again.
  }
};

export const createSessionDelegation = (
  inputs: DelegationInputs,
  host: DelegationHost,
): SessionDelegation => {
  const values = requestValuesOf(inputs);
  const listeners = new Set<(state: DelegationState) => void>();
  let state: DelegationState = OFFERED;
  let registered: ExpectedDelegation | undefined;
  // While an attempt begun from `refused` runs: the refusal it returns to.
  let kept:
    | {
        readonly code: DelegationRefusalCode;
        readonly sent: ExpectedDelegation;
      }
    | undefined;
  let channel:
    | { readonly handle: DelegationWindow; readonly link: DelegationChannel }
    | undefined;

  const set = (next: DelegationState): void => {
    state = next;
    for (const listener of listeners) listener(next);
  };

  const offer = (): DelegationOffer => {
    if (typeof values === "string") return not(values);
    if (host.ended()) return not("ended");
    if (state.state === "signing" || state.state === "registered") {
      return not("in-progress");
    }
    if (host.playback()) return not("book");
    if (host.roundOpen()) return not("round-open");
    const { id, text, status } = values.notice;
    return Object.freeze({
      kind: "offered",
      notice: Object.freeze({
        id,
        text,
        status: status === "approved" ? "approved" : "pending",
      }),
    });
  };

  // An attempt that did not register: its own outcome first, then, when it
  // began from `refused`, the refusal again with the kept delegation (W-71).
  const unregistered = (outcome: DelegationState): void => {
    set(outcome);
    const back = kept;
    kept = undefined;
    if (back !== undefined) {
      registered = back.sent;
      set(Object.freeze({ state: "refused", code: back.code }));
    }
  };

  const ended = (
    end: DelegationChannelEnd,
    request: RequestValues,
    actionKey: Address,
  ): void => {
    channel = undefined;
    if (end.kind === "closed") {
      unregistered(DECLINED);
    } else if (end.kind === "no-ready") {
      unregistered(failedState("no-ready"));
    } else if (end.answer.type === "failed") {
      unregistered(failedState(end.answer.reason));
    } else {
      const next = registeredOf(end.answer, request, actionKey);
      if (next === undefined) {
        unregistered(failedState("wallet-mismatch"));
        return;
      }
      // A new registration replaces a refused one (W-71).
      kept = undefined;
      registered = next;
      set(Object.freeze({ state: "registered", wallet: next.wallet }));
    }
  };

  /** The action key's address, or `undefined` once this page cannot sign. */
  const actionKeyNow = (): Address | undefined => {
    try {
      return inputs.actionKey();
    } catch {
      return undefined;
    }
  };

  const begin = (handle: DelegationWindow | null): DelegationBegin => {
    const refuse = (
      reason: Extract<DelegationBegin, { kind: "refused" }>["reason"],
    ): DelegationBegin => {
      // The handle it was given, never the window already open.
      if (handle !== null && handle !== channel?.handle) closeQuietly(handle);
      return Object.freeze({ kind: "refused", reason });
    };
    if (state.state === "signing") return refuse("busy");
    if (host.ended()) return refuse("session-ended");
    const actionKey = actionKeyNow();
    if (
      offer().kind !== "offered" ||
      typeof values === "string" ||
      actionKey === undefined
    ) {
      return refuse("not-offered");
    }
    // From `refused`, the refused delegation is kept until this attempt ends.
    if (state.state === "refused" && registered !== undefined) {
      kept = { code: state.code, sent: registered };
    }
    registered = undefined;
    if (handle === null) {
      // A blocked window (W-66): play goes on undelegated.
      unregistered(failedState("blocked"));
      return STARTED;
    }
    channel = {
      handle,
      link: openDelegationChannel({
        handle,
        signingPageOrigin: values.signingPageOrigin,
        clock: inputs.clock,
        request: requestOf(values, actionKey),
        onEnd: end => {
          ended(end, values, actionKey);
        },
      }),
    };
    set(SIGNING);
    return STARTED;
  };

  // "Continue without" (W-71): dropped only by the player's choice.
  const drop = (): void => {
    registered = undefined;
    kept = undefined;
    if (state.state === "registered" || state.state === "refused") set(OFFERED);
  };

  const onDelegation = (
    listener: (next: DelegationState) => void,
  ): (() => void) => {
    listeners.add(listener);
    return (): void => {
      listeners.delete(listener);
    };
  };

  return Object.freeze({
    useCase: Object.freeze({
      delegation: (): DelegationState => state,
      delegationOffer: offer,
      beginDelegation: begin,
      receiveDelegation: (event: DelegationEvent): void => {
        channel?.link.receive(event);
      },
      dropDelegation: drop,
      onDelegation,
    }),
    carried: (): ExpectedDelegation | undefined =>
      state.state === "registered" ? registered : undefined,
    // A "Sign again" attempt keeps the refused delegation: starts stay held
    // until it registers, or returns to `refused` (decided 2026-11-20).
    refusesStart: (): boolean =>
      state.state === "refused" || kept !== undefined,
    startRefused: (
      sent: ExpectedDelegation,
      status: number,
      code: string,
    ): void => {
      // Another refusal, or a delegation since dropped, changes nothing.
      if (state.state !== "registered" || registered !== sent) return;
      if (status === 422 && isRefusalCode(code)) {
        set(Object.freeze({ state: "refused", code }));
      }
    },
    end: (): void => {
      const open = channel;
      channel = undefined;
      kept = undefined;
      registered = undefined;
      if (open !== undefined) {
        open.link.stop();
        set(failedState("session-ended"));
      } else if (state.state === "registered" || state.state === "refused") {
        set(OFFERED);
      }
    },
  });
};
