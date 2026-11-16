// Test-only: the single screen (W-57, W-58) read back as a player and
// assistive technology meet it: whether the game frame shows and takes input,
// the overlay's form and heading, which element holds the page's
// `role="alert"`, the bar's slots, and the controls a player can use. The UI
// is mounted with a game frame in place, as the session mounts it.

import type { RoundCheck, SnapshotRead } from "../round-input.ts";
import { type Mounted, mount } from "./app.ts";
import { snapshotVector } from "./vectors.ts";

/** The shell's checks of a round it holds and found ready (W-26). */
export const HELD: RoundCheck = Object.freeze({
  verdict: "ready",
  outOfSync: false,
  cashOutOffered: false,
  cancel: "none",
});

/** A read of the vector `name`, with the shell's `check` of its round. */
export const readOf = (name: string, check?: RoundCheck): SnapshotRead =>
  check === undefined
    ? { kind: "snapshot", snapshot: snapshotVector(name) }
    : { kind: "snapshot", snapshot: snapshotVector(name), check };

export type Screen = Mounted & { readonly frame: HTMLIFrameElement };

/** The UI with a game frame in place, after `reads` (polls) in order. */
export const screenAfter = (...reads: readonly SnapshotRead[]): Screen => {
  const ui = mount();
  // The session's intents, so the bar offers its controls; its read never
  // answers, so only `reads` change the state.
  ui.app.connect({
    readSnapshot: () => new Promise<SnapshotRead>(() => {}),
    intents: { start: () => {}, cashOut: () => {}, checkAgain: () => {} },
  });
  const frame = globalThis.document.createElement("iframe");
  frame.toggleAttribute("inert", true);
  ui.app.gameHost().append(frame);
  for (const read of reads) ui.app.accept(read, "poll");
  return { ...ui, frame };
};

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/** What the screen shows, slot by slot. */
export type Shown = {
  /** The frame is in place on the stage (not hidden). */
  readonly frameShown: boolean;
  /** The frame takes input: not `inert` (W-58). */
  readonly playable: boolean;
  readonly overlay: string;
  /** The overlay's heading, or its scrim line. */
  readonly overlayText: string;
  /** Where the page's one `role="alert"` is: the cover or the bar. */
  readonly alertIn: "cover" | "bar" | "none";
  readonly status: string;
  readonly alertLine: string;
  readonly roundLine: string;
  /** The bar's balance slot (RFC-005). */
  readonly balance: string;
  /**
   * The labels of the round's controls a player can use in the bar, in order:
   * the alert's control, the round line's, the start slot's, and the menu's
   * links; not the bar's own furniture (the menu button, the fairness chip and
   * its popover, the bet stepper), which every state with a session has.
   */
  readonly controls: readonly string[];
};

/** The bar's furniture, left out of `Shown.controls`. */
const FURNITURE =
  ".se-menu-button, .se-chip-anchor *, .se-stepper *, .se-quick, .se-autoplay";

/** A control's label, without a display value beside it (W-57). */
const labelOf = (control: HTMLElement): string => {
  if (control instanceof HTMLInputElement) {
    return text(control.closest("label"));
  }
  const copy = control.cloneNode(true) as HTMLElement;
  for (const value of copy.querySelectorAll(".se-button__value")) {
    value.remove();
  }
  return text(copy);
};

export const shownOf = (screen: Screen): Shown => {
  const { host, frame } = screen;
  const overlay = host.querySelector<HTMLElement>(".se-overlay");
  const alerts = [...host.querySelectorAll('[role="alert"]')];
  const alertIn =
    alerts.length === 0
      ? "none"
      : alerts[0]?.classList.contains("se-overlay") === true
        ? "cover"
        : "bar";
  const usable = [
    ...host.querySelectorAll<HTMLElement>(
      ".se-bar button, .se-bar a, .se-bar input",
    ),
  ].filter(
    control =>
      !control.matches(FURNITURE) &&
      !(control instanceof HTMLButtonElement && control.disabled) &&
      !(control instanceof HTMLInputElement && control.disabled),
  );
  return {
    frameShown: host.querySelector<HTMLElement>(".se-game")?.hidden === false,
    playable: !frame.hasAttribute("inert"),
    overlay: overlay?.dataset["form"] ?? "none",
    overlayText: text(overlay?.querySelector(".se-heading, .se-overlay__text")),
    alertIn,
    status: text(host.querySelector(".se-status h1")),
    alertLine: text(host.querySelector(".se-alert")),
    roundLine: text(host.querySelector(".se-round")),
    balance: text(host.querySelector(".se-balance")),
    controls: usable.map(control => labelOf(control)),
  };
};

/**
 * The bar's text as shown: its popovers' panels are closed (the session
 * summary's time and count are not amounts, W-34).
 */
export const barShown = (host: HTMLElement): string => {
  const bar = host.querySelector(".se-bar")?.cloneNode(true);
  if (!(bar instanceof Element)) return "";
  for (const panel of bar.querySelectorAll(".se-popover")) panel.remove();
  return text(bar);
};
