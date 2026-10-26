// Test-only: the game's page mounted in jsdom with a fake parent, and the
// queries the page tests read it with, as a player or assistive technology
// would.

import type { Game } from "../game.ts";
import { mountGame } from "../mount.ts";
import { HEADING_ID } from "../render.ts";
import { fakeParent, type FakeParent } from "./parent.ts";

export type Mounted = {
  readonly parent: FakeParent;
  readonly game: Game;
  readonly host: HTMLElement;
};

export const mount = (framed = true): Mounted => {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const parent = fakeParent();
  const game = mountGame({
    doc: document,
    host,
    parent: framed ? parent.window : undefined,
    parentOrigin: framed ? "https://wrapper.example.test" : undefined,
    listen: parent.listen,
  });
  return { parent, game, host };
};

export const heading = (host: HTMLElement): string =>
  host.querySelector(`#${HEADING_ID}`)?.textContent ?? "";

export const detail = (host: HTMLElement): string =>
  host.querySelector(".rg-detail")?.textContent ?? "";

export const alertText = (host: HTMLElement): string =>
  host.querySelector('[role="alert"]')?.textContent ?? "";

export const callButton = (
  host: HTMLElement,
  label: string,
): HTMLButtonElement => {
  const button = [...host.querySelectorAll("button")].find(
    candidate => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`no ${label} button`);
  return button;
};

/**
 * Makes `document.hasFocus()` answer `focused` (as when the frame has or has
 * lost focus to the Wrapper) and returns how to undo it. jsdom's own answer
 * depends on what an earlier test focused, so the focus tests set it.
 */
export const setDocumentFocus = (focused: boolean): (() => void) => {
  Object.defineProperty(document, "hasFocus", {
    configurable: true,
    value: (): boolean => focused,
  });
  return () => {
    Reflect.deleteProperty(document, "hasFocus");
  };
};

/** Counts the `focus` events the heading receives from now on. */
export const headingFocusCount = (host: HTMLElement): (() => number) => {
  let count = 0;
  host.querySelector(`#${HEADING_ID}`)?.addEventListener("focus", () => {
    count += 1;
  });
  return () => count;
};

export const callsShown = (host: HTMLElement): boolean =>
  host.querySelector<HTMLElement>(".rg-calls")?.hidden === false;

/** The tile `option` of the row `step` on a steps round's board. */
export const tile = (
  host: HTMLElement,
  step: number,
  option: number,
): HTMLButtonElement => {
  const found = host.querySelector<HTMLButtonElement>(
    `.rg-tile[data-step="${String(step)}"][data-option="${String(option)}"]`,
  );
  if (found === null)
    throw new Error(`no tile ${String(option)} in ${String(step)}`);
  return found;
};

export const boardShown = (host: HTMLElement): boolean =>
  host.querySelector<HTMLElement>(".rg-board")?.hidden === false;
