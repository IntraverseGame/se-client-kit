// The bar's menu (RFC-005 section 8, W-49e, W-49f): a button at the bar's
// start whose popover holds "This session" (the time since the session
// opened and the rounds played, kept in memory only, no amount: Q4), then the
// lobby and the deposit, each offered exactly when W-49f offers it. In the
// session-ended state the lobby is the only way out, so there it is a visible
// control in the bar (bar-view.ts), not an item of this menu. Then the wallet
// delegation's item (W-64): "Link a wallet", which closes the menu and opens
// the consent dialog (delegation-wiring.ts), "Signing window open", which
// focuses that window, or the line "Wallet linked for this session", read when
// the menu opens. Opening the menu dismisses a delegation failure's alert
// (W-69). The popover is not a dialog (popover.ts).

import { withCount } from "./bar-messages.ts";
import { button, type Builder, type Child } from "./dom.ts";
import { glyph } from "./icons.ts";
import type { Messages } from "./messages.ts";
import { type LinkPlan, linkView } from "./operator-links.ts";
import { popover } from "./popover.ts";
import type { DelegationView, SessionSummary } from "./view-options.ts";

/** What the menu shows. */
export type MenuShown = {
  readonly m: Messages;
  readonly links: LinkPlan;
  readonly summary: (() => SessionSummary) | undefined;
  readonly delegation?: DelegationView;
};

export type MenuView = {
  readonly element: HTMLElement;
  /** Shows the menu (or hides it, `undefined`) with the links it offers. */
  readonly show: (shown: MenuShown | undefined) => void;
};

const minutesText = (m: Messages, minutes: number): string =>
  minutes < 1 ? m["menu.underMinute"] : withCount(m["menu.minutes"], minutes);

export const createMenuView = (el: Builder, doc: Document): MenuView => {
  let current: MenuShown | undefined;
  let signature = "";
  const menuButton = el("button", {
    type: "button",
    class: "se-menu-button",
    "aria-haspopup": "true",
    "data-focus-key": "menu",
  });
  menuButton.append(glyph(doc, "menu"));
  const content = (): readonly Child[] => {
    if (current === undefined) return [];
    const { m, links } = current;
    const summary = current.summary?.();
    return [
      summary !== undefined &&
        el("section", { class: "se-session" }, [
          el("h2", { class: "se-popover__title" }, [m["menu.session"]]),
          el("p", { class: "se-session__stats" }, [
            el("span", {}, [
              `${m["menu.time"]}: ${minutesText(m, summary.minutes)}`,
            ]),
            el("span", {}, [`${m["menu.rounds"]}: ${summary.rounds}`]),
          ]),
        ]),
      el("div", { class: "se-links" }, linkView(el, m, links)),
      current.delegation === undefined
        ? undefined
        : walletItem(current.delegation, m),
    ];
  };
  /** The delegation's item, by W-64's conditions as they hold now. */
  const walletItem = (view: DelegationView, m: Messages): Child => {
    const entry = view.entry();
    switch (entry.kind) {
      case "link": {
        return button(el, m["delegation.link"], "wallet-link", () => {
          pop.close();
          view.link();
        });
      }
      case "signing": {
        return button(el, m["delegation.signingOpen"], "wallet-open", () => {
          view.focusWindow();
        });
      }
      case "linked": {
        return el("p", { class: "se-wallet" }, [
          m["delegation.linkedLine"],
          " ",
          el("span", { class: "se-wallet__address" }, [entry.wallet]),
        ]);
      }
      default: {
        return undefined;
      }
    }
  };
  const pop = popover(el, doc, {
    className: "se-menu",
    button: menuButton,
    content,
    prefill: true,
  });
  // The menu is the player's next action: a failure's alert goes (W-69).
  menuButton.addEventListener("click", () => {
    current?.delegation?.dismiss();
  });
  return Object.freeze({
    element: pop.element,
    show: (shown): void => {
      pop.element.hidden = shown === undefined;
      current = shown;
      if (shown === undefined) {
        pop.close();
        return;
      }
      menuButton.setAttribute("aria-label", shown.m["menu.open"]);
      const next = JSON.stringify([shown.links, shown.delegation?.key ?? null]);
      if (next !== signature) {
        signature = next;
        pop.refresh();
      }
    },
  });
};
