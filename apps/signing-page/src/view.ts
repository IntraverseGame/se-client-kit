// The page's states on screen (specs/signing-page.md, SP-10, SP-11). Every
// text is set as text, never as markup (the page's policy also requires
// Trusted Types, so no markup sink could run). Each state's heading is in a
// polite live region and takes the focus on each state change, since every
// change follows the player's own action or the page's own load; "Confirm in
// your wallet…" is in the live region too. Wallet buttons are native buttons,
// by their announced names, in the order announced, all disabled once one is
// picked.

import { formatExpiry, TEXT } from "./messages.ts";
import type { PageNotice } from "./notice.ts";
import type { AnnouncedWallet } from "./wallet-discovery.ts";

/** What the page shows. */
export type ViewState =
  | { readonly kind: "lost" }
  | { readonly kind: "config-error" }
  | { readonly kind: "waiting-for-game" }
  | { readonly kind: "timed-out" }
  | { readonly kind: "discovering" }
  | {
      /** `choose` lists the wallets; `wallet` waits for the one picked. */
      readonly kind: "choose" | "wallet";
      readonly notice: PageNotice;
      /** Unix seconds. */
      readonly expiry: number;
      readonly wallets: readonly AnnouncedWallet[];
    }
  | { readonly kind: "finishing" };

export type View = {
  /** Shows `state` and moves the focus to its heading. */
  readonly show: (state: ViewState) => void;
  /** Adds a wallet announced while the list is shown, without moving focus. */
  readonly addWallet: (wallet: AnnouncedWallet) => void;
};

const HEADINGS = Object.freeze({
  lost: TEXT.lost,
  "config-error": TEXT.configError,
  "waiting-for-game": TEXT.waitingForGame,
  "timed-out": TEXT.timedOut,
  discovering: TEXT.discovering,
  choose: TEXT.chooseHeading,
  wallet: TEXT.chooseHeading,
  finishing: TEXT.finishing,
});

/**
 * Mounts the view into `root`. `onPick` is called once per click on an enabled
 * wallet button.
 */
export const createView = (
  root: HTMLElement,
  onPick: (wallet: AnnouncedWallet) => void,
): View => {
  const document = root.ownerDocument;
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let list: HTMLUListElement | undefined;
  let picking = false;

  const walletButton = (wallet: AnnouncedWallet): HTMLLIElement => {
    const item = element("li", "sp-wallets__item");
    const button = element("button", "sp-wallet", wallet.name);
    button.type = "button";
    button.disabled = !picking;
    button.addEventListener("click", () => {
      if (!picking) return;
      picking = false;
      onPick(wallet);
    });
    item.append(button);
    return item;
  };

  const chooseBody = (
    state: Extract<ViewState, { readonly kind: "choose" | "wallet" }>,
  ): HTMLElement => {
    const body = element("div", "sp-body");
    const notice = element("blockquote", "sp-notice", state.notice.text);
    body.append(element("p", "sp-text", TEXT.signThis));
    if (state.notice.status === "pending") {
      body.append(element("p", "sp-mark", TEXT.pending));
    }
    body.append(
      notice,
      element("p", "sp-text", TEXT.lastsUntil(formatExpiry(state.expiry))),
      element("p", "sp-text", TEXT.networkName),
    );
    const label = element("p", "sp-text", TEXT.chooseWallet);
    label.id = "sp-choose";
    list = element("ul", "sp-wallets");
    list.setAttribute("aria-labelledby", label.id);
    for (const wallet of state.wallets) list.append(walletButton(wallet));
    body.append(label, list);
    return body;
  };

  const show = (state: ViewState): void => {
    list = undefined;
    picking = state.kind === "choose";
    const main = element("main", "sp-page");
    const live = element("div", "sp-live");
    live.setAttribute("aria-live", "polite");
    const heading = element("h1", "sp-heading", HEADINGS[state.kind]);
    heading.tabIndex = -1;
    live.append(heading);
    if (state.kind === "wallet") {
      live.append(element("p", "sp-status", TEXT.confirmInWallet));
    }
    main.append(live);
    if (state.kind === "choose" || state.kind === "wallet") {
      main.append(chooseBody(state));
    }
    root.replaceChildren(main);
    heading.focus();
  };

  return Object.freeze({
    show,
    addWallet: (wallet: AnnouncedWallet) => {
      list?.append(walletButton(wallet));
    },
  });
};
