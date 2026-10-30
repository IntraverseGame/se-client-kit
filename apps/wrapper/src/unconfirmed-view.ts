// The move or cash-out not confirmed (W-16): its one resend was lost too, and
// the round is still `active` with the action neither applied nor refused.
// The bar's status line shows "your move (or cash-out) hasn't been confirmed"
// and that the round ends by its time limit if it never arrives; the round line
// the round id; the primary controls "check again", which only reads the round
// (nothing is sent or signed). The game stays shown, waiting and inert (W-58);
// a read that settles the round replaces this view.

import {
  type BarParts,
  button,
  type Builder,
  heading,
  roundIdField,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { RoundCheck } from "./round-input.ts";
import type { Intents } from "./view-options.ts";

export const unconfirmedView = (
  el: Builder,
  doc: Document,
  m: Messages,
  unconfirmed: NonNullable<RoundCheck["unconfirmed"]>,
  roundId: string | undefined,
  intents: Intents,
): BarParts => {
  const { checkAgain } = intents;
  const title = heading(
    el,
    doc,
    "h1",
    STATUS_HEADING_ID,
    unconfirmed === "cash-out"
      ? m["state.cashOutUnconfirmed"]
      : m["state.moveUnconfirmed"],
    "info",
    m["icon.info"],
  );
  title.dataset["focusKey"] = "unconfirmed";
  return {
    status: [
      title,
      el("p", { class: "se-detail" }, [m["state.unconfirmedDetail"]]),
    ],
    controls: [
      checkAgain !== undefined &&
        button(el, m["action.checkAgain"], "check-again", checkAgain),
    ],
    round: [
      roundId !== undefined && roundIdField(el, m["label.roundId"], roundId),
    ],
  };
};
