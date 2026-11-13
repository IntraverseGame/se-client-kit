// The views of the shell's own cancel (W-25, W-33, W-35): the round the cancel
// ended, a neutral "round ended" with no result claim, and the cancel left to
// check later, "still resolving — contact support" with "check again". Neither
// shows a win, a loss, a refund, or "your bet was returned".

import {
  type BarParts,
  button,
  type Builder,
  type Child,
  EMPTY_BAR,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { Intents } from "./view-options.ts";

/**
 * The round the shell's cancel ended (W-25, W-33), in the bar (W-57): a neutral
 * "round ended" and the next bet (`next`: the stepper and "Play again", from
 * the Snapshot's `bet`, W-31); the balance is the bar's own slot, of the
 * round's last Snapshot, then the read that followed. The round id and the
 * verify link show in the round line. The heading keeps the focus across that
 * read.
 */
export const endedView = (
  el: Builder,
  doc: Document,
  m: Messages,
  next: Pick<BarParts, "bet" | "controls" | "round">,
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
    ...next,
  };
};

/** "Check again" in the start slot, as a secondary control (W-16, W-33). */
export const checkAgainControl = (
  el: Builder,
  m: Messages,
  checkAgain: (() => void) | undefined,
): Child[] => {
  if (checkAgain === undefined) return [];
  const control = button(el, m["action.checkAgain"], "check-again", checkAgain);
  control.classList.add("se-button--wide");
  return [control];
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
    ...EMPTY_BAR,
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
    controls: checkAgainControl(el, m, checkAgain),
  };
};
