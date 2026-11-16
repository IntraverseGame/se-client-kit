// The round id with its copy control and the verify link (W-39): in the round
// receipt's popover once a round has ended (W-40; decided by the human,
// 2026-11-13), and in the round line of a state on the cover that gives them
// (out of sync, a cancel left to check later).

import {
  button,
  type Builder,
  type Child,
  externalLink,
  roundIdField,
  shortRoundId,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import { verifyUrlFor } from "./verify-link.ts";
import type { ViewOptions } from "./view-options.ts";

export { shortRoundId };

/** A secondary control, as light as the verify link beside it. */
const quiet = (control: HTMLButtonElement): HTMLButtonElement => {
  control.classList.add("se-button--quiet");
  return control;
};

/** The copy control and the verify link of a round (W-39). */
export const roundActions = (
  el: Builder,
  m: Messages,
  roundId: string,
  options: ViewOptions,
  announce: (text: string) => void,
): HTMLElement => {
  const copy = options.intents.copyText;
  return el("div", { class: "se-actions" }, [
    copy !== undefined &&
      quiet(
        button(el, m["action.copyRoundId"], "copy-round-id", () => {
          copy(roundId).then(
            () => {
              announce(m["notice.copied"]);
              return null;
            },
            () => {
              // The clipboard refused: the full round id stays shown, and in
              // the verify link, to copy by hand.
              return null;
            },
          );
        }),
      ),
    options.verifyBaseUrl !== undefined &&
      externalLink(
        el,
        m,
        verifyUrlFor(options.verifyBaseUrl, roundId),
        "action.verify",
        "verify",
      ),
  ]);
};

/** The round id shortened, its copy control, and the verify link (W-39). */
export const roundIdAndVerify = (
  el: Builder,
  m: Messages,
  roundId: string,
  options: ViewOptions,
  announce: (text: string) => void,
): Child[] => [
  roundIdField(el, m["label.roundId"], roundId),
  roundActions(el, m, roundId, options, announce),
];

/**
 * The round receipt's foot, once the round has ended (W-39, decided by the
 * human, 2026-11-13): the full round id (monospace, selectable), its copy
 * control, and the verify link.
 */
export const receiptFoot = (
  el: Builder,
  m: Messages,
  roundId: string,
  options: ViewOptions,
  announce: (text: string) => void,
): HTMLElement =>
  el("div", { class: "se-popover__foot" }, [
    el("p", { class: "se-field se-receipt__round" }, [
      el("span", { class: "se-field__label" }, [m["label.roundId"]]),
      el("code", { class: "se-receipt__id" }, [roundId]),
    ]),
    roundActions(el, m, roundId, options, announce),
  ]);
