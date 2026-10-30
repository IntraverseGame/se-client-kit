// The views of the shell's own cancel (W-25, W-33, W-35): the round the cancel
// ended, a neutral "round ended" with no result claim, and the cancel left to
// check later, "still resolving — contact support" with "check again". Neither
// shows a win, a loss, a refund, or "your bet was returned".

import { betSelector } from "./bet-selector.ts";
import {
  type BarParts,
  button,
  type Builder,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { SnapshotInput } from "./round-input.ts";
import type { Intents } from "./view-options.ts";

/**
 * The round the shell's cancel ended (W-25, W-33), in the bar (W-57): a neutral
 * "round ended", the balance (of `snapshot`: the round's last one, then the
 * read that followed), and the next bet, from that Snapshot's `bet` (W-31). The
 * round id and the verify link show in the round line. The heading keeps the
 * focus across that read.
 */
export const endedView = (
  el: Builder,
  doc: Document,
  m: Messages,
  snapshot: SnapshotInput,
  intents: Intents,
): BarParts & { readonly heading: HTMLElement } => {
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
  return {
    heading: title,
    status: [title],
    controls: [betSelector(el, m, snapshot, intents, "action.playAgain")],
    round: [field(el, m["label.balance"], snapshot.bet.balance.formatted)],
  };
};

/**
 * The cancel left to check later (W-33, W-35), in the bar (W-57): "still
 * resolving — contact support" in the status line and "check again"; the
 * round's failed verification is the stage's cover, and the round id and the
 * verify link are the round line's. No result and no bet selector.
 */
export const checkLaterView = (
  el: Builder,
  doc: Document,
  m: Messages,
  intents: Intents,
): BarParts => {
  const { checkAgain } = intents;
  return {
    status: [
      heading(
        el,
        doc,
        "h1",
        STATUS_HEADING_ID,
        m["state.checkLater"],
        "info",
        m["icon.info"],
      ),
    ],
    controls: [
      checkAgain !== undefined &&
        button(el, m["action.checkAgain"], "check-again", checkAgain),
    ],
    round: [],
  };
};
