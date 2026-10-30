// The stage (W-57): the game frame, mounted once by the session and kept in
// one place at one size, and the overlay over it, a translucent scrim while
// the round is checked or an opaque cover (stage-plan.ts). The frame is
// `inert` in every state but a playable round (W-58), and hidden only in the
// final states. A cover shown "as the alert" holds the page's one
// `role="alert"` region; the bar's alert line holds it otherwise.

import {
  ALERT_HEADING_ID,
  type Builder,
  type Child,
  COVER_HEADING_ID,
  heading,
  type Sections,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { Overlay, StagePlan } from "./stage-plan.ts";

export type StageView = {
  readonly element: HTMLElement;
  /** Where the session mounts the game's iframe (W-37). */
  readonly gameHost: HTMLElement;
  /** Applies a plan; answers whether the overlay's content changed. */
  readonly show: (plan: StagePlan, m: Messages, language: string) => boolean;
  /** The game's iframe element, once the session mounted it. */
  readonly frame: () => HTMLIFrameElement | null;
  /** The cover's heading, when a cover shows. */
  readonly coverHeading: () => HTMLElement | undefined;
  /** Whether the game's iframe element holds the focus. */
  readonly frameHasFocus: () => boolean;
  /**
   * Blurs the game's iframe element when it has the focus, so a heading can
   * take it (W-46): some engines do not move the focus out of a focused frame
   * on `focus()` alone (Firefox with its frames in the parent's process, as in
   * Playwright's Firefox build).
   */
  readonly blurFocusedFrame: () => void;
};

export const createStageView = (
  doc: Document,
  el: Builder,
  section: Sections,
): StageView => {
  const gameHost = el("div", { class: "se-game" });
  const overlay = el("div", { class: "se-overlay" });
  overlay.hidden = true;
  const element = el("div", { class: "se-stage" }, [gameHost, overlay]);

  const frame = (): HTMLIFrameElement | null =>
    gameHost.querySelector("iframe");

  const frameHasFocus = (): boolean => {
    const active = doc.activeElement;
    return active instanceof HTMLIFrameElement && gameHost.contains(active);
  };

  /** The overlay's content: the scrim's line, or the cover's heading. */
  const overlayView = (shown: Overlay, m: Messages): Child[] => {
    if (shown.form === "scrim") {
      return [el("p", { class: "se-overlay__text" }, [shown.text])];
    }
    if (shown.form === "none") return [];
    const { cover } = shown;
    return [
      heading(
        el,
        doc,
        "h1",
        cover.alert ? ALERT_HEADING_ID : COVER_HEADING_ID,
        cover.heading,
        cover.icon,
        m[`icon.${cover.icon}` as const],
      ),
      ...cover.lines.map(line => el("p", { class: "se-detail" }, [line])),
    ];
  };

  const show = (plan: StagePlan, m: Messages, language: string): boolean => {
    // The role first, then the content, so a cover shown as the alert is
    // inserted into an alert region (W-57).
    if (plan.overlay.form === "cover" && plan.overlay.cover.alert) {
      overlay.setAttribute("role", "alert");
    } else {
      overlay.removeAttribute("role");
    }
    const changed = section(
      overlay,
      JSON.stringify([language, plan.overlay]),
      () => overlayView(plan.overlay, m),
    );
    overlay.hidden = plan.overlay.form === "none";
    overlay.dataset["form"] = plan.overlay.form;
    gameHost.hidden = !plan.frameShown;
    // The frame takes input only in a playable round (W-58).
    frame()?.toggleAttribute("inert", plan.inert);
    return changed;
  };

  return Object.freeze({
    element,
    gameHost,
    show,
    frame,
    coverHeading: (): HTMLElement | undefined =>
      overlay.dataset["form"] === "cover"
        ? (overlay.querySelector<HTMLElement>(".se-heading") ?? undefined)
        : undefined,
    frameHasFocus,
    blurFocusedFrame: (): void => {
      const active = doc.activeElement;
      if (frameHasFocus() && active instanceof HTMLElement) active.blur();
    },
  });
};
