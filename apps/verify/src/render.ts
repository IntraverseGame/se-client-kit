// The page's view (V-4 to V-14): one heading, a text that says what happened,
// and at most one control per state. A state change is announced through one
// polite live region, a failure (V-7, V-10, V-11, the configuration error)
// through one `role="alert"` region; both exist from the start so assistive
// technology hears every change. Focus moves to the new heading only when the
// controller says the state follows the player's own action. Every value from
// the API is a text node; links from it are text, never followed (V-13).

import { elementBuilder } from "./dom.ts";
import { MESSAGES as M } from "./messages.ts";
import type { PageState, PageView } from "./page-state.ts";
import { reportView } from "./report-view.ts";
import {
  ERROR_ID,
  FIELD_ID,
  HEADING_ID,
  HINT_ID,
  iconOf,
  type PageActions,
  type Parts,
  paragraph,
  retryButton,
  rows,
  type View,
} from "./view-parts.ts";

/** The round id form (V-4), with its error tied to the field when `error`. */
const form = (p: Parts, text: string, error: boolean): HTMLElement => {
  const describedBy = error ? `${HINT_ID} ${ERROR_ID}` : HINT_ID;
  const input = p.el("input", {
    id: FIELD_ID,
    name: "roundId",
    type: "text",
    class: "vp-input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    inputmode: "text",
    "aria-describedby": describedBy,
    ...(error ? { "aria-invalid": "true" } : {}),
  });
  input.value = text;
  const element = p.el("form", { class: "vp-form", novalidate: "" }, [
    p.el("label", { for: FIELD_ID, class: "vp-label" }, [M["form.label"]]),
    p.el("p", { id: HINT_ID, class: "vp-hint" }, [M["form.hint"]]),
    input,
    error &&
      p.el("p", { id: ERROR_ID, class: "vp-field-error" }, [
        iconOf(p, "error"),
        " ",
        M["form.error"],
      ]),
    p.el("button", { type: "submit", class: "vp-button" }, [M["form.submit"]]),
  ]);
  element.addEventListener("submit", event => {
    event.preventDefault();
    p.actions.submit(input.value);
  });
  return element;
};

const roundIdRows = (p: Parts, roundId: string): HTMLElement | undefined =>
  rows(p, [{ label: M["round.id"], value: roundId }]);

const viewOf = (p: Parts, state: PageState): View => {
  switch (state.kind) {
    case "starting":
      return {
        heading: M["starting.heading"],
        icon: "progress",
        body: [paragraph(p, [M["starting.text"]])],
      };
    case "config-error":
      return {
        heading: M["configError.heading"],
        icon: "error",
        alert: [
          paragraph(p, [
            M[state.retryable ? "configError.retryText" : "configError.text"],
          ]),
        ],
        body: state.retryable ? [retryButton(p, "action.tryAgain")] : [],
      };
    case "form":
      return {
        heading: M["form.heading"],
        polite: state.error ? M["form.error"] : M["form.heading"],
        body: [
          paragraph(p, [M["form.intro"]]),
          form(p, state.text, state.error),
        ],
      };
    case "loading":
      return {
        heading: M["loading.heading"],
        icon: "progress",
        polite: M["loading.text"],
        body: [roundIdRows(p, state.roundId)],
      };
    case "report":
      return reportView(p, state.report);
    case "not-found":
      return {
        heading: M["notFound.heading"],
        icon: "info",
        body: [
          paragraph(p, [M["notFound.text"]]),
          roundIdRows(p, state.roundId),
          form(p, "", false),
        ],
      };
    case "api-error":
      return {
        heading: M["apiError.heading"],
        icon: "error",
        alert: [paragraph(p, [M["apiError.text"]])],
        body: [
          retryButton(p, "action.tryAgain"),
          roundIdRows(p, state.roundId),
        ],
      };
    default:
      // "unreachable"
      return {
        heading: M["unreachable.heading"],
        icon: "error",
        alert: [
          paragraph(p, [M["unreachable.text"]]),
          state.offline && paragraph(p, [M["unreachable.offline"]]),
        ],
        body: [
          retryButton(p, "action.tryAgain"),
          roundIdRows(p, state.roundId),
        ],
      };
  }
};

/**
 * Mounts the page into `host` and returns its view. The live regions are
 * created once, here, and only their contents change.
 */
export const mountPage = (
  doc: Document,
  host: Element,
  actions: PageActions,
): PageView => {
  const el = elementBuilder(doc);
  const head = el("div", { class: "vp-head" });
  const alert = el("div", { role: "alert", class: "vp-alert" });
  const polite = el("p", {
    "aria-live": "polite",
    "aria-atomic": "true",
    class: "vp-visually-hidden",
  });
  const body = el("div", { class: "vp-body" });
  host.replaceChildren(head, alert, polite, body);
  const announce = (text: string): void => {
    polite.textContent = text;
  };
  const parts: Parts = { el, doc, actions, announce };

  return {
    show: (state, focus) => {
      const hadFocus =
        doc.activeElement !== null && host.contains(doc.activeElement);
      const view = viewOf(parts, state);
      const heading = el(
        "h1",
        { id: HEADING_ID, class: "vp-heading", tabindex: "-1" },
        [
          view.icon === undefined ? undefined : iconOf(parts, view.icon),
          view.icon === undefined ? undefined : " ",
          el("span", {}, [view.heading]),
        ],
      );
      head.replaceChildren(heading);
      alert.replaceChildren(
        ...(view.alert ?? []).filter(
          (c): c is Node | string => c !== undefined && c !== false,
        ),
      );
      announce(view.alert === undefined ? (view.polite ?? view.heading) : "");
      body.replaceChildren(
        ...view.body.filter(
          (c): c is Node | string => c !== undefined && c !== false,
        ),
      );
      doc.title = `${view.heading} | ${M["page.title"]}`;
      if (focus) {
        heading.focus();
      } else if (state.kind === "form" && state.error && hadFocus) {
        // A refused submit keeps the player in the field, now described by its error.
        host.querySelector<HTMLElement>(`#${FIELD_ID}`)?.focus();
      }
    },
  };
};
