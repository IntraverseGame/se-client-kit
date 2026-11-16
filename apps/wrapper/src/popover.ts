// A popover of the bar (RFC-005: the menu, the round receipt, the autoplay
// counts): a panel a button opens and closes. It is not a dialog and traps no
// focus (W-45, W-46); the button says whether it is open (`aria-expanded`) and
// which panel it controls; Escape closes it and returns the focus to the
// button; a click outside it closes it, and so does the page losing the focus
// (a click in the game's frame never reaches the page) and a resize; a scroll
// moves it with its button (placing a link into view scrolls, and must not
// close the panel it is in). It never moves the focus on its own:
// opening leaves the focus on the button the player pressed.

import type { Builder, Child } from "./dom.ts";

export type Popover = {
  /** The button and its panel, in one anchor element. */
  readonly element: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly open: () => boolean;
  readonly close: () => void;
  /** Builds the content again, so it stays current; closed, only `prefill`. */
  readonly refresh: () => void;
};

let next = 0;

/**
 * A button that opens `panel`'s content, built on each opening by `content`, so
 * what it shows is current (the session's time, the round's checks).
 */
export const popover = (
  el: Builder,
  doc: Document,
  options: {
    readonly className: string;
    readonly button: HTMLButtonElement;
    readonly content: () => readonly Child[];
    /** Where the panel sits along the bar: from the anchor's start or end. */
    readonly align?: "start" | "end";
    /**
     * The content is kept in the closed panel too (the menu's links, so the
     * offer is in the page as W-49f gives it); otherwise it is built only while
     * the panel is open (the chip's, which would repeat the round id).
     */
    readonly prefill?: boolean;
  },
): Popover => {
  next += 1;
  const id = `se-popover-${next}`;
  const panel = el("div", {
    class: "se-popover",
    id,
    "data-align": options.align ?? "start",
  });
  panel.hidden = true;
  const { button } = options;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);
  const element = el("div", { class: `se-anchor ${options.className}` }, [
    button,
    panel,
  ]);

  const outside = (event: Event): void => {
    if (event.target instanceof Node && !element.contains(event.target)) {
      close();
    }
  };

  // The panel opens in the top layer where the platform has the Popover API,
  // placed above its button by two custom properties (CSSOM, so the page's
  // Content Security Policy holds): a scrolling status slot cannot clip it
  // and the game frame cannot cover it. Without the API it stays in place.
  const topLayer = typeof panel.showPopover === "function";
  if (topLayer) panel.setAttribute("popover", "manual");
  const view = doc.defaultView;
  const GAP = 10;
  const MARGIN = 8;
  const place = (): void => {
    if (view === null) return;
    const anchor = button.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    const wanted = options.align === "end" ? anchor.right - width : anchor.left;
    const left = Math.max(
      MARGIN,
      Math.min(wanted, view.innerWidth - width - MARGIN),
    );
    panel.style.setProperty("--se-pop-left", `${String(Math.round(left))}px`);
    panel.style.setProperty(
      "--se-pop-bottom",
      `${String(Math.round(view.innerHeight - anchor.top + GAP))}px`,
    );
  };
  const onViewport = (): void => {
    close();
  };
  const onScroll = (): void => {
    if (topLayer && !panel.hidden) place();
  };
  const listen = (on: boolean): void => {
    const method = on ? "addEventListener" : "removeEventListener";
    view?.[method]("resize", onViewport);
    view?.[method]("blur", onViewport);
    doc[method]("scroll", onScroll, true);
    doc[method]("pointerdown", outside, true);
  };

  const close = (): void => {
    if (panel.hidden) return;
    if (topLayer && panel.matches(":popover-open")) panel.hidePopover();
    listen(false);
    panel.hidden = true;
    if (options.prefill !== true) panel.replaceChildren();
    button.setAttribute("aria-expanded", "false");
  };

  const fill = (): void => {
    panel.replaceChildren(
      ...options
        .content()
        .filter(
          (child): child is Node | string =>
            child !== undefined && child !== false,
        ),
    );
  };

  const show = (): void => {
    fill();
    panel.hidden = false;
    if (topLayer) {
      panel.showPopover();
      place();
    }
    button.setAttribute("aria-expanded", "true");
    listen(true);
  };

  button.addEventListener("click", () => {
    if (panel.hidden) show();
    else close();
  });
  element.addEventListener("keydown", event => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    button.focus();
  });

  return Object.freeze({
    element,
    button,
    panel,
    open: (): boolean => !panel.hidden,
    close,
    refresh: (): void => {
      if (options.prefill === true || !panel.hidden) fill();
    },
  });
};
