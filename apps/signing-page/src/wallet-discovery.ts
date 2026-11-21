// Wallet discovery (specs/signing-page.md, SP-8): EIP-6963 only. The page
// listens for `eip6963:announceProvider` and dispatches one
// `eip6963:requestProvider`; there is no fallback to a global provider. An
// announcement is read only from an event whose `detail` holds an `info` with
// a string `uuid` and a string `name` (at most 64 characters, cut beyond) and a
// `provider` with a `request` function; anything else is ignored. Wallets
// announce on load and again on each request, so announcements are
// de-duplicated by `info.uuid`, the first kept. The announced icon is never
// read.

import type { Eip1193Provider } from "./wallet-port.ts";

export const ANNOUNCE_EVENT = "eip6963:announceProvider";
export const REQUEST_EVENT = "eip6963:requestProvider";

/** The longest wallet name shown, in characters. */
export const WALLET_NAME_MAX = 64;

/** One announced wallet. */
export type AnnouncedWallet = {
  readonly uuid: string;
  /** Shown as text, never markup. */
  readonly name: string;
  readonly provider: Eip1193Provider;
};

/** Where discovery listens and dispatches: the page's `window`. */
export type DiscoveryTarget = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener" | "dispatchEvent"
>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The wallet an event announces, or `undefined`. Never throws. */
export const readAnnouncement = (event: Event): AnnouncedWallet | undefined => {
  try {
    const detail: unknown = (event as Partial<CustomEvent>).detail;
    if (!isRecord(detail)) return undefined;
    const { info, provider } = detail;
    if (!isRecord(info) || !isRecord(provider)) return undefined;
    const { uuid, name } = info;
    const { request } = provider;
    if (
      typeof uuid !== "string" ||
      typeof name !== "string" ||
      typeof request !== "function"
    ) {
      return undefined;
    }
    return Object.freeze({
      uuid,
      name: Array.from(name).slice(0, WALLET_NAME_MAX).join(""),
      provider: provider as Eip1193Provider,
    });
  } catch {
    // A getter that throws is not an announcement.
    return undefined;
  }
};

export type Discovery = {
  /** The wallets announced so far, in the order announced. */
  readonly wallets: () => readonly AnnouncedWallet[];
  /** Stops listening. */
  readonly stop: () => void;
};

/**
 * Starts listening, then dispatches one request. `onWallet` is called for each
 * new wallet, in the order announced.
 */
export const discoverWallets = (
  target: DiscoveryTarget,
  onWallet: (wallet: AnnouncedWallet) => void,
): Discovery => {
  const found = new Map<string, AnnouncedWallet>();
  const listener = (event: Event): void => {
    const wallet = readAnnouncement(event);
    if (wallet === undefined || found.has(wallet.uuid)) return;
    found.set(wallet.uuid, wallet);
    onWallet(wallet);
  };
  target.addEventListener(ANNOUNCE_EVENT, listener);
  target.dispatchEvent(new Event(REQUEST_EVENT));
  return {
    wallets: () => [...found.values()],
    stop: () => {
      target.removeEventListener(ANNOUNCE_EVENT, listener);
    },
  };
};
