// Test-only: a scripted stand-in for the shell's delegation use case (W-62 to
// W-71), so the Wrapper's side is tested without a key, a wallet, or a window.
// Its `begin` and `drop` follow the shell's rules closely enough for the UI
// (a refused `begin` while `signing` or not offered; `null` is `blocked`; a
// drop from `registered` or `refused` is `offered`); every other state is set
// by the test. jsdom has no `showModal`, so `installDialog` gives
// `HTMLDialogElement` the two calls the consent dialog makes.

import type {
  DelegationBegin,
  DelegationEvent,
  DelegationNotice,
  DelegationOffer,
  DelegationState,
  DelegationWindow,
  PlaySession,
} from "@intraverse/se-client-shell";

export type DelegationMembers = Pick<
  PlaySession,
  | "delegation"
  | "delegationOffer"
  | "beginDelegation"
  | "receiveDelegation"
  | "dropDelegation"
  | "onDelegation"
>;

export type FakeDelegation = {
  readonly members: DelegationMembers;
  /** Sets the state and reports it, as the shell's `onDelegation` does. */
  readonly set: (state: DelegationState) => void;
  readonly setOffer: (offer: DelegationOffer) => void;
  /** The handles `beginDelegation` was given, in order. */
  readonly begun: (DelegationWindow | null)[];
  readonly received: DelegationEvent[];
  readonly drops: () => number;
};

/** The pending notice the backend publishes today, as a stand-in. */
export const PENDING_NOTICE: DelegationNotice = Object.freeze({
  id: "en-draft-1",
  text: "I authorize this session key.\n  Line two keeps its  spaces, and Case.",
  status: "pending",
});

export const OFFERED: DelegationOffer = Object.freeze({
  kind: "offered",
  notice: PENDING_NOTICE,
});

export const NOT_OFFERED: DelegationOffer = Object.freeze({
  kind: "not-offered",
  reason: "not-configured",
});

const refused = (
  reason: Extract<DelegationBegin, { kind: "refused" }>["reason"],
): DelegationBegin => ({ kind: "refused", reason });

export const createFakeDelegation = (): FakeDelegation => {
  const listeners = new Set<(state: DelegationState) => void>();
  const begun: (DelegationWindow | null)[] = [];
  const received: DelegationEvent[] = [];
  let state: DelegationState = { state: "offered" };
  let offer: DelegationOffer = NOT_OFFERED;
  let drops = 0;
  const set = (next: DelegationState): void => {
    state = next;
    for (const listener of Array.from(listeners)) listener(next);
  };
  return {
    members: {
      delegation: () => state,
      delegationOffer: () =>
        state.state === "signing" || state.state === "registered"
          ? { kind: "not-offered", reason: "in-progress" }
          : offer,
      beginDelegation: handle => {
        begun.push(handle);
        if (state.state === "signing") return refused("busy");
        if (offer.kind !== "offered") return refused("not-offered");
        set(
          handle === null
            ? { state: "failed", reason: "blocked" }
            : { state: "signing" },
        );
        return { kind: "started" };
      },
      receiveDelegation: event => {
        received.push(event);
      },
      dropDelegation: () => {
        drops += 1;
        if (state.state === "registered" || state.state === "refused") {
          set({ state: "offered" });
        }
      },
      onDelegation: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    set,
    setOffer: next => {
      offer = next;
    },
    begun,
    received,
    drops: () => drops,
  };
};

/**
 * Gives jsdom's `HTMLDialogElement` `showModal` and `close` (it has neither):
 * `open` follows the attribute, and `close` fires `close` as the platform
 * does.
 */
export const installDialog = (): void => {
  const proto = HTMLDialogElement.prototype;
  Object.defineProperty(proto, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(proto, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
};
