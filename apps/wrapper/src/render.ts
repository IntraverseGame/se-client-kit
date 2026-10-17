// The Wrapper's own UI, rendered into one host element from `WrapperState`
// (W-28 to W-35, W-39 to W-48). The DOM is built with `createElement` and
// `textContent` only: no markup string, no inline style or script, so every
// value from the network is text and the Content Security Policy holds.
//
// Accessibility (W-45 to W-48):
//   - a status change is announced through a polite live region; an error is
//     shown in a `role="alert"` panel;
//   - focus moves to the result or error heading only when the player's own
//     action caused the change (`cause: "player"`), never after a poll; a
//     section whose content changes keeps the focused control focused;
//   - win, loss, and error carry text and an icon with a text alternative
//     beside the colour;
//   - every control and state has a text label in the session's language.

import {
  ALERT_HEADING_ID,
  type Child,
  elementBuilder,
  replace,
  STATUS_HEADING_ID,
} from "./dom.ts";
import { icon } from "./icons.ts";
import { type Localized, messagesFor } from "./messages.ts";
import { TERMINAL_STATUSES } from "./round-input.ts";
import { roundView } from "./round-view.ts";
import {
  alertContent,
  alertView,
  blockingView,
  roundIdAndVerify,
} from "./state-views.ts";
import type { ChangeCause, ViewOptions } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

export type View = {
  readonly root: HTMLElement;
  readonly update: (state: WrapperState, cause: ChangeCause) => void;
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
  const notices = el("div", { class: "se-notices" });
  const alert = el("div", { class: "se-alert", role: "alert" });
  const status = el("section", { class: "se-status" });
  const ended = el("section", { class: "se-ended" });
  const live = el("div", {
    class: "se-visually-hidden",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  const root = el("div", { class: "se-wrapper" }, [
    notices,
    el("main", { class: "se-main" }, [alert, status, ended]),
    live,
  ]);
  host.replaceChildren(root);

  const signatures = new Map<HTMLElement, string>();
  /** Re-renders a section only when what it shows changed. */
  const section = (
    target: HTMLElement,
    signature: string,
    children: () => readonly Child[],
  ): boolean => {
    if (signatures.get(target) === signature) {
      return false;
    }
    signatures.set(target, signature);
    replace(doc, target, children());
    return true;
  };

  let announced = "";
  const announce = (text: string): void => {
    if (text !== announced) {
      announced = text;
      live.textContent = text;
    }
  };

  const update = (state: WrapperState, cause: ChangeCause): void => {
    const options = currentOptions();
    const localized = languageOf(state);
    const m = localized.messages;
    root.setAttribute("lang", localized.language);
    const { snapshot } = state;
    const final =
      state.blocking === "configuration-error" ||
      state.blocking === "session-ended" ||
      state.blocking === "other-tab";

    section(
      notices,
      JSON.stringify([
        localized.language,
        state.chainNotIndependent,
        state.slow,
      ]),
      () => [
        state.chainNotIndependent &&
          el("p", { class: "se-notice se-notice--chain" }, [
            icon(doc, "info", m["icon.info"]),
            el("span", {}, [m["notice.chainNotIndependent"]]),
          ]),
        state.slow &&
          el("p", { class: "se-notice se-notice--slow" }, [
            icon(doc, "progress", m["icon.progress"]),
            el("span", {}, [m["notice.slow"]]),
          ]),
      ],
    );

    const error = alertContent(m, state);
    const alertChanged = section(
      alert,
      JSON.stringify([
        localized.language,
        error,
        options.verifyBaseUrl ?? null,
        options.intents.retry !== undefined,
      ]),
      () =>
        error === undefined
          ? []
          : alertView(el, doc, m, error, options, announce),
    );
    alert.toggleAttribute("data-empty", error === undefined);

    const showRound = state.blocking === undefined && snapshot !== undefined;
    section(
      status,
      JSON.stringify([
        localized.language,
        state.blocking ?? null,
        showRound ? snapshot.version : null,
        options.intents.start !== undefined,
        options.intents.newRound !== undefined,
        state.blocking === "session-ended"
          ? (snapshot?.context.links?.lobby ?? null)
          : null,
      ]),
      () =>
        showRound
          ? roundView(el, doc, localized, snapshot, options.intents)
          : blockingView(el, doc, m, state),
    );

    const endedRound = final ? undefined : state.endedRound;
    section(
      ended,
      JSON.stringify([
        localized.language,
        endedRound ?? null,
        options.verifyBaseUrl ?? null,
        options.intents.copyText !== undefined,
      ]),
      () =>
        endedRound === undefined
          ? []
          : roundIdAndVerify(el, m, endedRound.roundId, options, announce),
    );

    const statusHeadingElement = root.querySelector(`#${STATUS_HEADING_ID}`);
    if (statusHeadingElement === null) {
      status.removeAttribute("aria-labelledby");
    } else {
      status.setAttribute("aria-labelledby", STATUS_HEADING_ID);
    }

    // The polite announcement: the state's heading, or the slow notice.
    const statusHeading = statusHeadingElement?.textContent;
    if (state.slow) {
      announce(m["notice.slow"]);
    } else if (statusHeading !== undefined && statusHeading !== null) {
      announce(statusHeading);
    }

    if (cause === "player") {
      const target =
        error !== undefined && alertChanged
          ? root.querySelector<HTMLElement>(`#${ALERT_HEADING_ID}`)
          : snapshot !== undefined &&
              TERMINAL_STATUSES.has(snapshot.status) &&
              showRound
            ? statusHeadingElement
            : null;
      if (target instanceof HTMLElement) {
        target.focus();
      }
    }
  };

  return Object.freeze({ root, update });
};
