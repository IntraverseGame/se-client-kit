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

export const callsShown = (host: HTMLElement): boolean =>
  host.querySelector<HTMLElement>(".rg-calls")?.hidden === false;
