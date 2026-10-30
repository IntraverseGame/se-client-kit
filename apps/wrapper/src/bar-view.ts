// The control bar (W-57), under the stage, which changes in place: the
// development badge (W-26a), the status line (its heading and at most one line
// of detail), the alert line (an error that does not stop the round), the
// primary controls, the round line, and the operator links (W-49e, W-49f). A
// slot with nothing to show stays empty; no control shows disabled for a
// state that does not offer it. When a cover state owns the page's alert
// region, the bar's error is plain text: its icon and styling stay, its
// `role` and its announcement go.

import {
  ALERT_HEADING_ID,
  type BarParts,
  type Builder,
  type Sections,
  STATUS_HEADING_ID,
} from "./dom.ts";
import { icon } from "./icons.ts";
import type { Localized, Messages } from "./messages.ts";
import { linkPlan, linkView } from "./operator-links.ts";
import { roundIdAndVerify } from "./round-id-view.ts";
import { roundView } from "./round-view.ts";
import {
  type AlertContent,
  alertContent,
  alertView,
  blockingView,
} from "./state-views.ts";
import type { ViewOptions } from "./view-options.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

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
  /** The status line, primary controls, or round line changed. */
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

/**
 * A slot whose text does not fit scrolls inside the bar and is reachable by
 * keyboard while it overflows (W-57): `tabindex="0"` then, none otherwise.
 * Checked on every update and on every size change of the bar
 * (height-observer.ts), since a width, zoom, or text-size change can make it
 * overflow with no state change.
 */
export const markOverflow = (slot: Element): void => {
  if (slot.scrollHeight > slot.clientHeight) {
    slot.setAttribute("tabindex", "0");
  } else {
    slot.removeAttribute("tabindex");
  }
};

/**
 * The status detail of a pending move or cash-out (W-16, W-57): only while an
 * error that does not stop the round shows beside an `active` round, so normal
 * play never flashes it.
 */
export const waitingDetail = (
  m: Messages,
  state: WrapperState,
): string | undefined => {
  const pending = state.check?.pending;
  const erred =
    state.problem !== undefined ||
    state.refused === true ||
    state.connectionProblem;
  if (pending === undefined || !erred || state.snapshot?.status !== "active") {
    return undefined;
  }
  return pending === "cash-out"
    ? m["detail.waitingCashOut"]
    : m["detail.waitingMove"];
};

export const createBarView = (
  doc: Document,
  el: Builder,
  section: Sections,
  announce: (text: string) => void,
): BarView => {
  const notices = el("div", { class: "se-notices" });
  const status = el("section", { class: "se-status" });
  const alert = el("div", { class: "se-alert", role: "alert" });
  const controls = el("div", { class: "se-controls" });
  const roundLine = el("div", { class: "se-round" });
  const links = el("div", { class: "se-actions se-links" });
  const element = el("div", { class: "se-bar" }, [
    notices,
    status,
    alert,
    controls,
    roundLine,
    links,
  ]);
  let barKey = "";

  /** The status line, controls, and round line of `input`'s state. */
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
            state.check,
            cancelEnded,
            detail,
          )
        : blockingView(el, doc, m, state, options, announce);
    const ended = isFinal(state) ? undefined : state.endedRound;
    return {
      status:
        !showsRound && detail !== undefined && shown.status.length > 0
          ? [...shown.status, el("p", { class: "se-detail" }, [detail])]
          : shown.status,
      controls: shown.controls,
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

  const show = (input: BarInput): BarShown => {
    const { state, options, localized, coverOwnsAlert } = input;
    const m = localized.messages;
    const { language } = localized;
    const { snapshot } = state;

    section(
      notices,
      JSON.stringify([language, state.chainNotIndependent]),
      () => [
        state.chainNotIndependent &&
          el("p", { class: "se-notice se-notice--chain" }, [
            icon(doc, "info", m["icon.info"]),
            el("span", {}, [m["notice.chainNotIndependent"]]),
          ]),
      ],
    );

    const error = alertContent(m, state);
    // The role first, then the content: when the line takes the page's alert
    // region back from a cover, its error is inserted into an alert region, so
    // it is announced; while a cover owns the region, the plain text never
    // lands in one (W-57).
    if (coverOwnsAlert) {
      alert.removeAttribute("role");
    } else {
      alert.setAttribute("role", "alert");
    }
    const alertChanged = section(
      alert,
      JSON.stringify([
        language,
        error,
        coverOwnsAlert,
        options.intents.retry !== undefined,
      ]),
      () =>
        error === undefined
          ? []
          : alertView(el, doc, m, error, options, coverOwnsAlert),
    );
    alert.toggleAttribute("data-empty", error === undefined);
    markOverflow(alert);

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
    const detail =
      waitingDetail(m, state) ?? (state.slow ? m["notice.slow"] : undefined);
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
    const changed = key !== barKey;
    if (changed) {
      barKey = key;
      const shown = parts(input, showsRound, cancelEnded, detail);
      section(status, key, () => shown.status);
      section(controls, key, () => shown.controls);
      section(roundLine, key, () => shown.round);
    }

    const offer = linkPlan(state, options.links, options.calling === true);
    section(links, JSON.stringify([language, offer]), () =>
      linkView(el, m, offer),
    );
    // The slot keeps its height when it has no link (W-57: no state makes the
    // bar grow or shrink).

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
