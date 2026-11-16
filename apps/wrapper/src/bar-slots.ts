// Two behaviours of the bar's slots (W-57, RFC-005): a slot whose text
// overflows takes a tab stop while it does, and Space starts a round while the
// focus is on the bar itself (Q5), never on one of its controls, a field, or
// the game frame, and never cashes out.

/**
 * A slot whose text does not fit scrolls inside the bar and is reachable by
 * keyboard while it overflows (W-57): `tabindex="0"` then, none otherwise. The
 * status slot and the alert line's own box are such slots. Checked on every
 * update and on every size change of the bar (height-observer.ts), since a
 * width, zoom, or text-size change can make it overflow with no state change.
 */
export const markOverflow = (slot: Element): void => {
  if (
    slot.scrollHeight > slot.clientHeight ||
    slot.scrollWidth > slot.clientWidth
  ) {
    slot.setAttribute("tabindex", "0");
  } else {
    slot.removeAttribute("tabindex");
  }
};

/** Space starts a round while the focus is on the bar itself (Q5). */
export const spaceStarts = (bar: HTMLElement): void => {
  bar.addEventListener("keydown", event => {
    if (event.target !== bar || event.key !== " " || event.repeat) return;
    const start = bar.querySelector<HTMLButtonElement>(
      'button.se-start[data-focus-key="start"]',
    );
    if (
      start === null ||
      start.disabled ||
      start.getAttribute("aria-disabled") === "true"
    ) {
      return;
    }
    event.preventDefault();
    start.click();
  });
};
