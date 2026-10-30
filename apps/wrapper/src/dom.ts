// DOM helpers of the Wrapper's UI. Elements are built with `createElement`,
// attributes with `setAttribute`, and text with text nodes only: no markup
// string and no inline style, so every value from the network is text and the
// Content Security Policy holds.

import { icon, type IconName } from "./icons.ts";
import type { MessageKey, Messages } from "./messages.ts";

/** A child of an element; `undefined` and `false` are left out. */
export type Child = Node | string | undefined | false;

export const STATUS_HEADING_ID = "se-status-heading";
export const ALERT_HEADING_ID = "se-alert-heading";
/** The stage's cover heading (W-57), the alert's when the cover owns it. */
export const COVER_HEADING_ID = "se-cover-heading";

/**
 * What the control bar's slots hold (W-57): the status line (its heading and at
 * most one line of detail), the primary controls, and the round line. The alert
 * line and the operator links are render.ts's own.
 */
export type BarParts = {
  readonly status: readonly Child[];
  readonly controls: readonly Child[];
  readonly round: readonly Child[];
};

export const EMPTY_BAR: BarParts = Object.freeze({
  status: Object.freeze([]),
  controls: Object.freeze([]),
  round: Object.freeze([]),
});

/** An element factory bound to a document. */
export const elementBuilder = (doc: Document) => {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Readonly<Record<string, string>> = {},
    children: readonly Child[] = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    for (const child of children) {
      if (child !== undefined && child !== false) {
        element.append(child);
      }
    }
    return element;
  };
  return el;
};

export type Builder = ReturnType<typeof elementBuilder>;

/** A link that opens in a new browsing context with no opener or referrer. */
export const externalLink = (
  el: Builder,
  m: Messages,
  href: string,
  key: MessageKey,
  focusKey: string,
): HTMLAnchorElement =>
  el(
    "a",
    {
      class: "se-link",
      href,
      target: "_blank",
      rel: "noopener noreferrer",
      "data-focus-key": focusKey,
    },
    [
      m[key],
      " ",
      el("span", { class: "se-visually-hidden" }, [m["notice.opensInNewTab"]]),
    ],
  );

export const heading = (
  el: Builder,
  doc: Document,
  level: "h1" | "h2",
  id: string,
  text: string,
  iconName: IconName | undefined,
  iconLabel: string,
): HTMLElement =>
  el(
    level,
    {
      ...(id === "" ? {} : { id }),
      class: "se-heading",
      tabindex: "-1",
    },
    [
      iconName === undefined ? undefined : icon(doc, iconName, iconLabel),
      el("span", {}, [text]),
    ],
  );

export const field = (el: Builder, label: string, value: string): HTMLElement =>
  el("p", { class: "se-field" }, [
    el("span", { class: "se-field__label" }, [label]),
    " ",
    el("span", { class: "se-field__value" }, [value]),
  ]);

/** A round id, labelled, as text (W-39, W-41). */
export const roundIdField = (
  el: Builder,
  label: string,
  roundId: string,
): HTMLElement =>
  el("p", { class: "se-field" }, [
    el("span", { class: "se-field__label" }, [label]),
    " ",
    el("code", { class: "se-round-id" }, [roundId]),
  ]);

export const button = (
  el: Builder,
  label: string,
  focusKey: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement => {
  const element = el(
    "button",
    { type: "button", class: "se-button", "data-focus-key": focusKey },
    [label],
  );
  element.disabled = disabled;
  element.addEventListener("click", onClick);
  return element;
};

/** Replaces a section's content, keeping the focused control focused. */
export const replace = (
  doc: Document,
  section: HTMLElement,
  children: readonly Child[],
): void => {
  const active = doc.activeElement;
  const focusKey =
    active instanceof HTMLElement && section.contains(active)
      ? active.dataset["focusKey"]
      : undefined;
  section.replaceChildren(
    ...children.filter(
      (child): child is Node | string => child !== undefined && child !== false,
    ),
  );
  if (focusKey !== undefined) {
    const again = section.querySelector<HTMLElement>(
      `[data-focus-key="${focusKey}"]`,
    );
    again?.focus({ preventScroll: true });
  }
};

/** Re-renders a section only when what it shows changed. */
export type Sections = (
  target: HTMLElement,
  signature: string,
  children: () => readonly Child[],
) => boolean;

/** The sections of one view, each re-rendered only when its signature moves. */
export const createSections = (doc: Document): Sections => {
  const signatures = new Map<HTMLElement, string>();
  return (target, signature, children) => {
    if (signatures.get(target) === signature) return false;
    signatures.set(target, signature);
    replace(doc, target, children());
    return true;
  };
};
