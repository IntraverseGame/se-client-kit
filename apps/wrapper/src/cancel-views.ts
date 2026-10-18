// The views of the shell's own cancel (W-25, W-33, W-35): the round the cancel
// ended, a neutral "round ended" with no result claim, and the cancel left to
// check later, "still resolving — contact support" with "check again". Neither
// shows a win, a loss, a refund, or "your bet was returned".

import {
  button,
  type Builder,
  type Child,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { SnapshotInput } from "./round-input.ts";
import type { Intents } from "./view-options.ts";

/**
 * The round the shell's cancel ended (W-25, W-33): a neutral "round ended", the
 * balance (of `snapshot`: the round's last one, then the read that followed),
 * and a new round. The round id and the verify link show in the ended round's
 * panel. The heading keeps the focus across that read.
 */
export const endedView = (
  el: Builder,
  doc: Document,
  m: Messages,
  snapshot: SnapshotInput,
  intents: Intents,
): Child[] => {
  const { newRound } = intents;
  const title = heading(
    el,
    doc,
    "h1",
    STATUS_HEADING_ID,
    m["status.ended"],
    "info",
    m["icon.info"],
  );
  title.dataset["focusKey"] = "ended";
  return [
    title,
    field(el, m["label.balance"], snapshot.bet.balance.formatted),
    newRound !== undefined &&
      button(el, m["action.newRound"], "new-round", newRound),
  ];
};

/**
 * The cancel left to check later (W-33, W-35): "still resolving — contact
 * support" and "check again", in the status section; the round's failed
 * verification, its round id, and the verify link show in the alert panel. No
 * result and no new round.
 */
export const checkLaterView = (
  el: Builder,
  doc: Document,
  m: Messages,
  intents: Intents,
): Child[] => {
  const { checkAgain } = intents;
  return [
    heading(
      el,
      doc,
      "h1",
      STATUS_HEADING_ID,
      m["state.checkLater"],
      "info",
      m["icon.info"],
    ),
    checkAgain !== undefined &&
      button(el, m["action.checkAgain"], "check-again", checkAgain),
  ];
};
