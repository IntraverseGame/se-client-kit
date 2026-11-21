// The signing page's run (specs/signing-page.md, SP-4 to SP-10), on an
// injected host so tests drive it: the opener first (with none, the
// lost-connection state and nothing else, for good); then the configuration
// (refused: its error state, no message); then the `message` listener and one
// `ready` per allowed Wrapper origin, each with that origin as `targetOrigin`;
// one `request` from the opener and an allowed origin, within 10 s, fixing that
// origin; the notice from the page's own copy; EIP-6963 discovery with a 1 s
// wait; one wallet at a time through the wallet port; the revoke; then the
// answer, to the fixed origin only, the opener dropped, and the window closed
// by the page itself. It logs nothing, keeps nothing, and reads no URL,
// referrer, window name, or storage.

import {
  keyDelegationTypedData,
  sessionIdBytes32,
} from "@intraverse/se-client-signing";

import { delay, type PageClock } from "./clock.ts";
import { loadSignerConfig } from "./load-config.ts";
import { findNotice } from "./notice.ts";
import {
  type AnswerMessage,
  failedMessage,
  readRequest,
  readyMessage,
  resultMessage,
  type SigningRequest,
} from "./protocol.ts";
import { askWallet, revokeConnection } from "./sign-flow.ts";
import { createView, type View } from "./view.ts";
import {
  type AnnouncedWallet,
  type Discovery,
  type DiscoveryTarget,
  discoverWallets,
} from "./wallet-discovery.ts";
import { createWalletPort } from "./wallet-port.ts";

/** SP-6: the page's own wait for the request, after `ready`. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** SP-8: how long discovery waits for an announcement. */
export const DISCOVERY_WAIT_MS = 1000;

/** The Wrapper's frame, as the page holds it through `window.opener`. */
export type OpenerWindow = {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
};

/** What the page runs on: the real `window` in a browser, fakes in tests. */
export type PageHost = {
  /** `window.opener`, read once, first. */
  readonly readOpener: () => OpenerWindow | null;
  /** `window.opener = null`, after the answer. */
  readonly dropOpener: () => void;
  /** `window.close()`, after the opener is dropped. */
  readonly closeWindow: () => void;
  /** `location.origin`. */
  readonly ownOrigin: string;
  readonly fetch: typeof fetch;
  readonly clock: PageClock;
  /** The page's `window`: its `message` events and EIP-6963's. */
  readonly events: DiscoveryTarget;
  /** Where the view is mounted. */
  readonly root: HTMLElement;
};

/** What a click on an enabled wallet button does, once the list is shown. */
type PickRef = { current: (wallet: AnnouncedWallet) => void };

type Signing = {
  readonly opener: OpenerWindow;
  /** The Wrapper origin the request came from, fixed for the page's life. */
  readonly origin: string;
  readonly view: View;
  readonly host: PageHost;
};

/**
 * Posts the one answer to the fixed origin, drops the opener, then closes the
 * window (SP-9): once the opener is dropped, Chromium and WebKit no longer let
 * the Wrapper's `close()` on its handle close it, so the page closes itself.
 */
const answer = (signing: Signing, message: AnswerMessage): void => {
  signing.view.show({ kind: "finishing" });
  signing.opener.postMessage(message, signing.origin);
  signing.host.dropOpener();
  signing.host.closeWindow();
};

/** The typed data's JSON text, or `undefined` when the builder refuses. */
const typedDataText = (
  request: SigningRequest,
  notice: string,
): string | undefined => {
  try {
    return JSON.stringify(
      keyDelegationTypedData({
        notice,
        actionKey: request.actionKey as `0x${string}`,
        sessionId: sessionIdBytes32(request.sessionId),
        expiry: request.expiry,
      }),
    );
  } catch {
    return undefined;
  }
};

/** The wallet picked: its signature or failure, the revoke, the answer. */
const signWith = async (
  signing: Signing,
  wallet: AnnouncedWallet,
  typedData: string,
): Promise<void> => {
  const port = createWalletPort(wallet.provider, typedData);
  const outcome = await askWallet(port, typedData);
  signing.view.show({ kind: "finishing" });
  await revokeConnection(port, signing.host.clock);
  answer(
    signing,
    outcome.kind === "result"
      ? resultMessage(outcome.wallet, outcome.signature)
      : failedMessage(outcome.reason),
  );
};

/** The request read: the notice, discovery, and the wallet list. */
const handleRequest = async (
  signing: Signing,
  request: SigningRequest,
  acceptPendingNotices: boolean,
  pick: PickRef,
): Promise<void> => {
  const notice = findNotice(request.noticeId, acceptPendingNotices);
  if (notice === undefined) {
    answer(signing, failedMessage("unknown-notice"));
    return;
  }
  const typedData = typedDataText(request, notice.text);
  if (typedData === undefined) {
    answer(signing, failedMessage("invalid-request"));
    return;
  }
  const { view, host } = signing;
  view.show({ kind: "discovering" });
  let listed = false;
  const discovery: Discovery = discoverWallets(host.events, wallet => {
    if (listed) view.addWallet(wallet);
  });
  await delay(host.clock, DISCOVERY_WAIT_MS);
  const wallets = discovery.wallets();
  if (wallets.length === 0) {
    discovery.stop();
    answer(signing, failedMessage("no-wallet"));
    return;
  }
  listed = true;
  const state = { notice, expiry: request.expiry } as const;
  pick.current = wallet => {
    discovery.stop();
    view.show({ kind: "wallet", ...state, wallets: discovery.wallets() });
    void signWith(signing, wallet, typedData);
  };
  view.show({ kind: "choose", ...state, wallets });
};

/** Runs the page on `host`. Never throws. */
export const runSigningPage = async (host: PageHost): Promise<void> => {
  const pick: PickRef = { current: () => null };
  const view = createView(host.root, wallet => {
    pick.current(wallet);
  });
  const opener = host.readOpener();
  if (opener === null) {
    view.show({ kind: "lost" });
    return;
  }
  const config = await loadSignerConfig({
    fetch: host.fetch,
    clock: host.clock,
    ownOrigin: host.ownOrigin,
  });
  if (config === undefined) {
    view.show({ kind: "config-error" });
    return;
  }
  // Set in the same task as the `ready`s below, before any message can run;
  // it fires only after `onMessage` below is defined.
  const timer = host.clock.setTimeout(() => {
    host.events.removeEventListener("message", onMessage);
    view.show({ kind: "timed-out" });
  }, REQUEST_TIMEOUT_MS);
  const onMessage = (event: Event): void => {
    const message = event as MessageEvent;
    if (
      message.source !== opener ||
      !config.wrapperOrigins.includes(message.origin)
    ) {
      return;
    }
    const reading = readRequest(message.data);
    if (reading === undefined) return;
    // One request: every later message is ignored.
    host.events.removeEventListener("message", onMessage);
    host.clock.clearTimeout(timer);
    const signing: Signing = { opener, origin: message.origin, view, host };
    if (reading.kind === "invalid") {
      answer(signing, failedMessage("invalid-request"));
      return;
    }
    void handleRequest(
      signing,
      reading.request,
      config.acceptPendingNotices,
      pick,
    );
  };
  host.events.addEventListener("message", onMessage);
  view.show({ kind: "waiting-for-game" });
  for (const origin of config.wrapperOrigins) {
    opener.postMessage(readyMessage(), origin);
  }
};
