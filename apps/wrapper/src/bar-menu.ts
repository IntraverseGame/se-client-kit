// The bar's menu (RFC-005 section 8, W-49e, W-49f): a button at the bar's
// start whose popover holds "This session" (the time since the session
// opened and the rounds played, kept in memory only, no amount: Q4), then the
// lobby and the deposit, each offered exactly when W-49f offers it. In the
// session-ended state the lobby is the only way out, so there it is a visible
// control in the bar (bar-view.ts), not an item of this menu. The popover is
// not a dialog (popover.ts).

import { withCount } from "./bar-messages.ts";
import type { Builder, Child } from "./dom.ts";
import { glyph } from "./icons.ts";
import type { Messages } from "./messages.ts";
import { type LinkPlan, linkView } from "./operator-links.ts";
import { popover } from "./popover.ts";
import type { SessionSummary } from "./view-options.ts";

export type MenuView = {
  readonly element: HTMLElement;
  /** Shows the menu (or hides it, `undefined`) with the links it offers. */
  readonly show: (
    shown:
      | {
          readonly m: Messages;
          readonly links: LinkPlan;
          readonly summary: (() => SessionSummary) | undefined;
        }
      | undefined,
  ) => void;
};

const minutesText = (m: Messages, minutes: number): string =>
  minutes < 1 ? m["menu.underMinute"] : withCount(m["menu.minutes"], minutes);

export const createMenuView = (el: Builder, doc: Document): MenuView => {
  let current:
    | {
        readonly m: Messages;
        readonly links: LinkPlan;
        readonly summary: (() => SessionSummary) | undefined;
      }
    | undefined;
  let signature = "";
  const button = el("button", {
    type: "button",
    class: "se-menu-button",
    "aria-haspopup": "true",
    "data-focus-key": "menu",
  });
  button.append(glyph(doc, "menu"));
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
    ];
  };
  const pop = popover(el, doc, {
    className: "se-menu",
    button,
    content,
    prefill: true,
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
      button.setAttribute("aria-label", shown.m["menu.open"]);
      const next = JSON.stringify(shown.links);
      if (next !== signature) {
        signature = next;
        pop.refresh();
      }
    },
  });
};
