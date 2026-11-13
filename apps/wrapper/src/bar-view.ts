// The control bar (W-57, RFC-005), which changes in place: one line of
// controls in the visual and tab order of the menu, the balance, the bet
// stepper, the status slot, and the start control, over a 2 px state edge
// (W-60). The status slot holds the fairness chip (W-59), the status line (its
// heading, the multiplier, and at most one line of detail), after it on the
// same row the alert line (an error that does not stop the round), and then
// the round line (the payout, and the round id with its copy control and the
// verify link once a round has ended, W-39). W-26a's badge sits in a row of
// its own above, for the whole session. A slot with nothing to show stays
// empty, its space kept; no control shows disabled for a state that does not
// offer it. When a cover state owns the page's alert region, the bar's error
// is plain text: its icon and styling stay, its `role` and its announcement
// go. The bar itself takes the focus on a click (`tabindex="-1"`): while it
// has it, Space starts a round (Q5), never a cash-out.

import { createBarChrome } from "./bar-chrome.ts";
import { markOverflow, spaceStarts } from "./bar-slots.ts";
import { edgeOf, waitingDetail } from "./bar-state.ts";
import { createBetModel } from "./bet-stepper.ts";
import {
  ALERT_HEADING_ID,
  type BarParts,
  type Builder,
  field,
  type Sections,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { Localized } from "./messages.ts";
import { roundView } from "./round-view.ts";
import {
  type AlertContent,
  alertContent,
  alertView,
  blockingView,
  roundIdAndVerify,
} from "./state-views.ts";
import type { ViewOptions } from "./view-options.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

export { waitingDetail };

export type BarInput = {
  readonly state: WrapperState;
  readonly options: ViewOptions;
  readonly localized: Localized;
  /** A cover state owns the page's `role="alert"` region (W-57). */
  readonly coverOwnsAlert: boolean;
};

/** What one update of the bar showed, for the focus rules (W-46). */
export type BarShown = {
  readonly error: AlertContent | undefined;
  readonly alertChanged: boolean;
  /** The status line, the controls, or the round line changed. */
  readonly changed: boolean;
  /** The bar shows the round, not a state of the cover. */
  readonly showsRound: boolean;
  readonly statusHeading: HTMLElement | undefined;
  readonly alertHeading: HTMLElement | undefined;
};

export type BarView = {
  readonly element: HTMLElement;
  readonly show: (input: BarInput) => BarShown;
};

export const createBarView = (
  doc: Document,
  el: Builder,
  section: Sections,
  announce: (text: string) => void,
): BarView => {
  const model = createBetModel();
  const chrome = createBarChrome(doc, el, section, announce);
  const status = el("section", { class: "se-status" });
  const alert = el("div", { class: "se-alert", role: "alert" });
  const roundLine = el("div", { class: "se-round" });
  // The alert line overlays the status (W-57): it sits in the status slot,
  // after the status heading on the same row; the round line follows.
  const statusSlot = el("div", { class: "se-status-slot" }, [
    chrome.chip,
    status,
    alert,
    roundLine,
  ]);
  const balance = el("div", { class: "se-balance" });
  const betSlot = el("div", { class: "se-bet-slot" });
  const controls = el("div", { class: "se-controls" });
  const element = el(
    "div",
    { class: "se-bar", tabindex: "-1", role: "region" },
    [
      el("div", { class: "se-edge", "aria-hidden": "true" }, [
        el("i", { class: "se-edge__mark" }),
      ]),
      chrome.notices,
      el("div", { class: "se-menu-slot" }, [chrome.menu]),
      balance,
      betSlot,
      statusSlot,
      el("div", { class: "se-start-slot" }, [controls, chrome.relaunch]),
    ],
  );
  spaceStarts(element);
  let barKey = "";
  let controlsShown = "";

  /** The slots of `input`'s state. */
  const parts = (
    input: BarInput,
    showsRound: boolean,
    cancelEnded: boolean,
    detail: string | undefined,
  ): BarParts => {
    const { state, options, localized } = input;
    const m = localized.messages;
    const { snapshot } = state;
    const shown =
      showsRound && snapshot !== undefined
        ? roundView(
            el,
            doc,
            localized,
            snapshot,
            options.intents,
            { model, options },
            state.check,
            cancelEnded,
            detail,
          )
        : blockingView(el, doc, m, state, options, announce);
    const ended = isFinal(state) ? undefined : state.endedRound;
    return {
      ...shown,
      status:
        !showsRound && detail !== undefined && shown.status.length > 0
          ? [...shown.status, el("p", { class: "se-detail" }, [detail])]
          : shown.status,
      // The ended round's id and verify link (W-39, W-40), beside its result;
      // a blocking state's bar gives its own round line.
      round:
        ended === undefined || !showsRound
          ? shown.round
          : [
              ...shown.round,
              ...roundIdAndVerify(el, m, ended.roundId, options, announce),
            ],
    };
  };

  /** The alert line: its role first, then its content (W-57). */
  const showAlert = (input: BarInput, error: AlertContent | undefined) => {
    const { options, localized, coverOwnsAlert } = input;
    // When the line takes the page's alert region back from a cover, its
    // error is inserted into an alert region, so it is announced; while a
    // cover owns the region, the plain text never lands in one.
    if (coverOwnsAlert) {
      alert.removeAttribute("role");
    } else {
      alert.setAttribute("role", "alert");
    }
    const changed = section(
      alert,
      JSON.stringify([
        localized.language,
        error,
        coverOwnsAlert,
        options.intents.retry !== undefined,
      ]),
      () =>
        error === undefined
          ? []
          : alertView(
              el,
              doc,
              localized.messages,
              error,
              options,
              coverOwnsAlert,
            ),
    );
    alert.toggleAttribute("data-empty", error === undefined);
    return changed;
  };

  const show = (input: BarInput): BarShown => {
    const { state, options, localized } = input;
    const m = localized.messages;
    const { language } = localized;
    const { snapshot } = state;
    element.setAttribute("aria-label", m["bar.label"]);
    element.dataset["edge"] = edgeOf(state, options);
    // The start control keeps its autoplay segment's width for the session
    // when autoplay is offered (book rounds, and the configuration's field).
    element.toggleAttribute(
      "data-autoplay",
      options.autoplay !== undefined &&
        options.intents.autoplay !== undefined &&
        snapshot?.presentation === "playback",
    );

    const error = alertContent(m, state);
    const alertChanged = showAlert(input, error);

    // A state on the cover that stops the round shows only what W-57's table
    // gives the bar.
    const showsRound =
      state.blocking === undefined &&
      snapshot !== undefined &&
      state.gameIncompatible !== true &&
      !(snapshot.status === "active" && state.check === undefined);
    // The shell's cancel ended the round (W-33): "round ended" stays, with the
    // balance of the read that followed (`idle`), until the player starts
    // another round.
    const cancelEnded =
      state.check?.cancel === "ended" ||
      (state.endedRound?.status === "ended" && snapshot?.status === "idle");
    const detail = waitingDetail(m, state, options);
    const key = JSON.stringify([
      language,
      state.blocking ?? null,
      state.gameIncompatible === true,
      snapshot?.version ?? null,
      snapshot?.status ?? null,
      state.check ?? null,
      options.intents.start !== undefined,
      options.intents.cashOut !== undefined,
      options.intents.checkAgain !== undefined,
      options.intents.copyText !== undefined,
      options.verifyBaseUrl ?? null,
      cancelEnded,
      detail ?? null,
      isFinal(state) ? null : (state.endedRound ?? null),
    ]);
    // A call in flight or a run of autoplay changes the stepper and the start
    // control only (busy), never the status line, whose heading keeps the
    // focus it holds.
    const controlsKey = JSON.stringify([
      key,
      options.calling === true,
      options.autoplay ?? null,
    ]);
    const changed = key !== barKey;
    if (changed || controlsKey !== controlsShown) {
      barKey = key;
      controlsShown = controlsKey;
      const shown = parts(input, showsRound, cancelEnded, detail);
      section(status, key, () => shown.status);
      section(betSlot, controlsKey, () => shown.bet);
      section(controls, controlsKey, () => shown.controls);
      section(roundLine, key, () => shown.round);
      section(balance, key, () => [
        showsRound &&
          snapshot !== undefined &&
          field(el, m["label.balance"], snapshot.bet.balance.formatted),
      ]);
    }
    chrome.show(state, options, localized);
    // The slots keep their size whatever they hold (W-57: no state makes the
    // bar grow or shrink), so the check comes after them.
    markOverflow(statusSlot);
    markOverflow(alert);

    const statusHeading =
      status.querySelector<HTMLElement>(`#${STATUS_HEADING_ID}`) ?? undefined;
    if (statusHeading === undefined) {
      status.removeAttribute("aria-labelledby");
    } else {
      status.setAttribute("aria-labelledby", STATUS_HEADING_ID);
    }
    return {
      error,
      alertChanged,
      changed,
      showsRound,
      statusHeading,
      alertHeading:
        alert.querySelector<HTMLElement>(`#${ALERT_HEADING_ID}`) ?? undefined,
    };
  };

  return Object.freeze({ element, show });
};
