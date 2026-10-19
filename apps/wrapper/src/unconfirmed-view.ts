// The move or cash-out not confirmed (W-16): its one resend was lost too, and
// the round is still `active` with the action neither applied nor refused.
// The status section shows "your move (or cash-out) hasn't been confirmed",
// that the round ends by its time limit if it never arrives, the round id, and
// "check again", which only reads the round (nothing is sent or signed). The
// game stays shown, waiting; a read that settles the round replaces this view.

import {
  button,
  type Builder,
  type Child,
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
): Child[] => {
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
  return [
    title,
    el("p", { class: "se-detail" }, [m["state.unconfirmedDetail"]]),
    roundId !== undefined && roundIdField(el, m["label.roundId"], roundId),
    checkAgain !== undefined &&
      button(el, m["action.checkAgain"], "check-again", checkAgain),
  ];
};
