// The bar's furniture around the round (RFC-005): W-26a's badge, in a row of
// its own for the whole session; the menu (bar-menu.ts) with the lobby and
// the deposit as W-49f offers them, and the session summary; the lobby as a
// visible control in the session-ended state, where it is the only way out
// (W-49f: "Relaunch from the lobby"); and the fairness chip (W-59). A run of
// autoplay counts as a call in flight for W-49f: no lobby and no deposit
// until it stops.

import { createMenuView } from "./bar-menu.ts";
import type { Builder, Sections } from "./dom.ts";
import { createChipView } from "./fairness-view.ts";
import { chipOf } from "./fairness.ts";
import { icon } from "./icons.ts";
import type { Localized } from "./messages.ts";
import { linkPlan, linkView } from "./operator-links.ts";
import type { ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

export type BarChrome = {
  readonly notices: HTMLElement;
  readonly menu: HTMLElement;
  readonly chip: HTMLElement;
  readonly relaunch: HTMLElement;
  readonly show: (
    state: WrapperState,
    options: ViewOptions,
    localized: Localized,
  ) => void;
};

/** The states with no session yet, where the bar has no menu (W-57). */
const NO_SESSION: ReadonlySet<string> = new Set([
  "loading",
  "configuration-error",
  "unsupported-browser",
]);

export const createBarChrome = (
  doc: Document,
  el: Builder,
  section: Sections,
  announce: (text: string) => void,
): BarChrome => {
  const chip = createChipView(el, doc);
  const menu = createMenuView(el, doc);
  const notices = el("div", { class: "se-notices" });
  const relaunch = el("div", { class: "se-links se-relaunch" });
  const show = (
    state: WrapperState,
    options: ViewOptions,
    localized: Localized,
  ): void => {
    const m = localized.messages;
    section(
      notices,
      JSON.stringify([localized.language, state.chainNotIndependent]),
      () => [
        state.chainNotIndependent &&
          el("p", { class: "se-notice se-notice--chain" }, [
            icon(doc, "info", m["icon.info"]),
            el("span", {}, [m["notice.chainNotIndependent"]]),
          ]),
      ],
    );
    const busy =
      options.calling === true || options.autoplay?.run !== undefined;
    const offer = linkPlan(state, options.links, busy);
    const { lobby, ...others } = offer;
    const leaving = lobby?.label === "action.relaunch";
    section(
      relaunch,
      JSON.stringify([localized.language, leaving, offer]),
      () => (leaving ? linkView(el, m, { lobby }) : []),
    );
    menu.show(
      state.blocking !== undefined && NO_SESSION.has(state.blocking)
        ? undefined
        : { m, links: leaving ? others : offer, summary: options.summary },
    );
    chip.show(chipOf(state), { el, doc, m, options, announce });
  };
  return Object.freeze({
    notices,
    menu: menu.element,
    chip: chip.element,
    relaunch,
    show,
  });
};
