// The Wrapper's own UI, rendered into one host element from `WrapperState`
// (W-28 to W-35, W-39 to W-48, W-57, W-58). The DOM is built with
// `createElement` and `textContent` only: no markup string, no inline style or
// script, so every value from the network is text and the Content Security
// Policy holds.
//
// One screen (W-57): the stage (the game frame, kept in place, and the overlay
// over it; stage-view.ts, stage-plan.ts) over one control bar that changes in
// place (bar-view.ts). The frame is `inert` in every state but a playable
// round (W-58).
//
// Accessibility (W-45 to W-48):
//   - a status change is announced through a polite live region (the bar's
//     status line, or the heading of a cover that is not the alert); an error
//     through the page's one `role="alert"` region, the bar's alert line or a
//     cover shown as the alert;
//   - focus follows W-46 (focus-rules.ts);
//   - win, loss, and error carry text and an icon with a text alternative
//     beside the colour;
//   - every control and state has a text label in the session's language.

import { createBarView } from "./bar-view.ts";
import { createSections, elementBuilder } from "./dom.ts";
import { createIntoGame, type FocusInput, focusTarget } from "./focus-rules.ts";
import { type Localized, messagesFor } from "./messages.ts";
import { stagePlan } from "./stage-plan.ts";
import { createStageView } from "./stage-view.ts";
import type { ChangeCause, ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

export type View = {
  readonly root: HTMLElement;
  /**
   * Where the game iframe is mounted (W-37). It is built once and never
   * re-rendered, so the frame survives every update in one place and at one
   * size; it is hidden only in the final states (stage-plan.ts).
   */
  readonly gameHost: HTMLElement;
  /** The control bar, whose reserved height `resize` reports (W-49d). */
  readonly bar: HTMLElement;
  /** The stage, whose minimum height `resize` reports (W-49d). */
  readonly stage: HTMLElement;
  readonly update: (state: WrapperState, cause: ChangeCause) => void;
  /** The player started a round: the frame takes the focus once it is ready. */
  readonly started: () => void;
};

const languageOf = (state: WrapperState): Localized =>
  messagesFor(state.snapshot?.context.language);

/** Builds the UI in `host` and returns its updater. */
export const createView = (
  doc: Document,
  host: HTMLElement,
  currentOptions: () => ViewOptions,
): View => {
  const el = elementBuilder(doc);
  const section = createSections(doc);
  const live = el("div", {
    class: "se-visually-hidden",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  let announced = "";
  const announce = (text: string): void => {
    if (text !== announced) {
      announced = text;
      live.textContent = text;
    }
  };
  const stage = createStageView(doc, el, section);
  const bar = createBarView(doc, el, section, announce);
  const root = el("div", { class: "se-wrapper" }, [
    el("main", { class: "se-main" }, [stage.element, bar.element]),
    live,
  ]);
  host.replaceChildren(root);
  const intoGame = createIntoGame();

  const update = (state: WrapperState, cause: ChangeCause): void => {
    const options = currentOptions();
    const localized = languageOf(state);
    const m = localized.messages;
    root.setAttribute("lang", localized.language);
    const before = doc.activeElement;
    const frameHadFocus = stage.frameHasFocus();
    // A control of the bar that holds the focus (W-46's removed-control rule;
    // a heading is not one).
    const barControl =
      before instanceof HTMLElement &&
      bar.element.contains(before) &&
      !before.classList.contains("se-heading")
        ? before
        : undefined;
    const plan = stagePlan(m, state, options.calling === true);
    const cover =
      plan.overlay.form === "cover" ? plan.overlay.cover : undefined;
    const coverChanged = stage.show(plan, m, localized.language);
    const shown = bar.show({
      state,
      options,
      localized,
      coverOwnsAlert: cover?.alert === true,
    });
    const coverHeading = stage.coverHeading();

    // The polite announcement: the status line's heading, the slow notice, or
    // the heading of a cover that is not the alert.
    if (state.slow) {
      announce(m["notice.slow"]);
    } else if (shown.statusHeading?.textContent !== undefined) {
      announce(shown.statusHeading.textContent);
    } else if (cover !== undefined && !cover.alert) {
      announce(cover.heading);
    }

    const active = doc.activeElement;
    const input: FocusInput = {
      state,
      cause,
      plan,
      cover,
      coverChanged,
      coverHeading,
      bar: shown,
      frameHadFocus,
      barControl,
      focusDropped: active === null || active === doc.body,
    };
    const target = focusTarget(input);
    if (target !== undefined) {
      stage.blurFocusedFrame();
      target.focus();
    }
    intoGame.after(doc, input, stage.frame());
  };

  return Object.freeze({
    root,
    gameHost: stage.gameHost,
    bar: bar.element,
    stage: stage.element,
    update,
    started: intoGame.started,
  });
};
