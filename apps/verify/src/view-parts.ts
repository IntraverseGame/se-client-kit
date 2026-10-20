// The building blocks of the page's view (V-14): the player's actions, a
// state's parts, and values shown as text, a hash or an address in full,
// monospaced, with a copy control.

import type { CheckStatus, Detail } from "./check-result.ts";
import { type Builder, type Child, icon, type IconName } from "./dom.ts";
import { MESSAGES as M, type MessageKey } from "./messages.ts";

/** The player's actions, wired by the entry point to the controller. */
export type PageActions = {
  readonly submit: (text: string) => void;
  readonly retry: () => void;
  /** Writes `text` to the clipboard. */
  readonly copy: (text: string) => Promise<void>;
};

export const HEADING_ID = "vp-heading";
export const FIELD_ID = "vp-round-id";
export const HINT_ID = "vp-round-id-hint";
export const ERROR_ID = "vp-round-id-error";

/** What one state shows. */
export type View = {
  readonly heading: string;
  readonly icon?: IconName | undefined;
  /** The failure's text, in the `role="alert"` region. */
  readonly alert?: readonly Child[] | undefined;
  /** What the polite region announces (defaults to the heading). */
  readonly polite?: string | undefined;
  readonly body: readonly Child[];
};

// A hash, an address, or a signature: shown in full, monospaced, with a copy
// control (V-14).
export const HEX_VALUE = /^0x[0-9a-fA-F]{40,}$/u;

export const ICON_LABEL: Readonly<Record<IconName, MessageKey>> = {
  matches: "icon.matches",
  mismatch: "icon.mismatch",
  unverified: "icon.unverified",
  "not-checked": "icon.notChecked",
  error: "icon.error",
  info: "icon.info",
  progress: "icon.progress",
};

export const STATUS_ICON: Readonly<Record<CheckStatus, IconName>> = {
  matches: "matches",
  mismatch: "mismatch",
  unverified: "unverified",
  "not-checked": "not-checked",
};

export const STATUS_TEXT: Readonly<Record<CheckStatus, MessageKey>> = {
  matches: "check.matches",
  mismatch: "check.mismatch",
  unverified: "check.unverified",
  "not-checked": "check.notChecked",
};

export type Parts = {
  readonly el: Builder;
  readonly doc: Document;
  readonly actions: PageActions;
  readonly announce: (text: string) => void;
};

export const iconOf = (p: Parts, name: IconName): Element =>
  icon(p.doc, name, M[ICON_LABEL[name]]);

/**
 * A value as text; a hash or an address in full, monospaced, with a copy
 * control.
 */
export const value = (p: Parts, label: string, text: string): HTMLElement => {
  if (!HEX_VALUE.test(text)) {
    return p.el("span", { class: "vp-value" }, [text]);
  }
  const copy = p.el(
    "button",
    {
      type: "button",
      class: "vp-copy",
      "aria-label": `${M["action.copy"]} ${label}`,
    },
    [M["action.copy"]],
  );
  copy.addEventListener("click", () => {
    void p.actions.copy(text).then(
      () => {
        p.announce(M["action.copied"]);
        return true;
      },
      // A refused clipboard write announces nothing.
      () => false,
    );
  });
  return p.el("span", { class: "vp-value vp-value--hex" }, [
    p.el("code", { class: "vp-mono" }, [text]),
    " ",
    copy,
  ]);
};

export const row = (p: Parts, label: string, text: string): HTMLElement =>
  p.el("div", { class: "vp-row" }, [
    p.el("dt", { class: "vp-row__label" }, [label]),
    p.el("dd", { class: "vp-row__value" }, [value(p, label, text)]),
  ]);

export const rows = (
  p: Parts,
  entries: readonly Detail[],
): HTMLElement | undefined =>
  entries.length === 0
    ? undefined
    : p.el(
        "dl",
        { class: "vp-rows" },
        entries.map(e => row(p, e.label, e.value)),
      );

export const retryButton = (p: Parts, key: MessageKey): HTMLElement => {
  const button = p.el("button", { type: "button", class: "vp-button" }, [
    M[key],
  ]);
  button.addEventListener("click", () => {
    p.actions.retry();
  });
  return button;
};

export const paragraph = (p: Parts, children: readonly Child[]): HTMLElement =>
  p.el("p", { class: "vp-text" }, children);
