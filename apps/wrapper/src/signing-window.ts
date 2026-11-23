// Opening the wallet's signing window (W-66, W-67): the plumbing the consent
// dialog's confirm calls in its `click` handler (S6). It calls `window.open`
// synchronously, with no `await` before it, so the window opens under the
// click's transient user activation, at the signing page's origin plus `/`,
// unnamed and without `noopener` (the Wrapper keeps the handle); it hands the
// handle (or `null`, a blocked window) to the shell's delegation use case; and,
// while the attempt runs, it routes the handle's messages to the shell through
// the page's one `message` listener (the third route, W-67). It logs nothing
// and keeps nothing once the attempt ends.

import type {
  DelegationBegin,
  DelegationWindow,
  PlaySession,
} from "@intraverse/se-client-shell";

import type { MessageDispatch } from "./message-dispatch.ts";

/** The signing window's features (W-66): a popup, 480 by 720. */
export const SIGNING_WINDOW_FEATURES = "popup,width=480,height=720";

export type SigningWindowOptions = {
  /** The platform `window.open`. */
  readonly open: (
    url: string,
    target: string,
    features: string,
  ) => DelegationWindow | null;
  /** The configured `signingPageOrigin` (W-62). */
  readonly signingPageOrigin: string;
  readonly session: Pick<
    PlaySession,
    "beginDelegation" | "receiveDelegation" | "onDelegation"
  >;
  readonly messages: Pick<MessageDispatch, "onSigner">;
};

export type SigningWindow = {
  readonly begun: DelegationBegin;
  /** The handle, for the menu's "Signing window open" to focus (W-64). */
  readonly handle: DelegationWindow | null;
};

/** Opens the signing window and begins the attempt; call it in the click. */
export const openSigningWindow = (
  options: SigningWindowOptions,
): SigningWindow => {
  const { session } = options;
  // No `await` before this line: the click's activation must still hold.
  const handle = options.open(
    `${options.signingPageOrigin}/`,
    "_blank",
    SIGNING_WINDOW_FEATURES,
  );
  const begun = session.beginDelegation(handle);
  if (begun.kind === "started" && handle !== null) {
    const stopRoute = options.messages.onSigner(handle, message => {
      session.receiveDelegation(message);
    });
    // The route lives while the attempt runs: any other state ends it.
    const stopWatch = session.onDelegation(state => {
      if (state.state === "signing") return;
      stopRoute();
      stopWatch();
    });
  }
  return Object.freeze({ begun, handle });
};
