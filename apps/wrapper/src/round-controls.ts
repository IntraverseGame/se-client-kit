// The round's controls in the bar (W-31, W-57, RFC-005 sections 2 and 5):
// the next bet (the stepper and the start control, and a book round's return
// to player for the round line, W-56), the cash-out control in the start
// control's place, and whether the player owes the first pick. Money is the
// Snapshot's `formatted`; never an amount the Wrapper computed (W-34).

import { type BetModel, betStepper } from "./bet-stepper.ts";
import { type BarParts, button, type Builder, field } from "./dom.ts";
import type { Localized } from "./messages.ts";
import { formatMultiplier, shownCashOutValue } from "./round-amounts.ts";
import type { RoundCheck, SnapshotInput } from "./round-input.ts";
import { rtpPercent } from "./rtp.ts";
import { startControl } from "./start-control.ts";
import type { Intents, ViewOptions } from "./view-options.ts";

/** What the round view needs of the bar: the bet's choice and the options. */
export type BarContext = {
  readonly model: BetModel;
  readonly options: ViewOptions;
};

/**
 * The next bet (W-31): the stepper, preset to `defaultBet`, and the start
 * control ("Place bet" at `idle`, "Play again" beside a result, W-57); and a
 * book round's return to player for the round line when its Snapshot carries
 * `config.rtp` (W-56): "Return to player: 96.00%". None when it is absent, with
 * no error.
 */
export const nextBet = (
  el: Builder,
  doc: Document,
  m: Localized["messages"],
  snapshot: SnapshotInput,
  intents: Intents,
  bar: BarContext,
  label: "action.placeBet" | "action.playAgain" = snapshot.status === "idle"
    ? "action.placeBet"
    : "action.playAgain",
): Pick<BarParts, "bet" | "controls" | "round"> => {
  const decimal =
    snapshot.presentation === "playback"
      ? snapshot.config.rtp?.decimal
      : undefined;
  const percent = decimal === undefined ? undefined : rtpPercent(decimal);
  bar.model.sync(snapshot.bet);
  const busy =
    bar.options.calling === true || bar.options.autoplay?.run !== undefined;
  return {
    bet: [betStepper(el, doc, m, bar.model, busy)],
    controls: [
      intents.start !== undefined &&
        startControl({
          el,
          doc,
          m,
          model: bar.model,
          intents,
          options: bar.options,
          label,
          book: snapshot.presentation === "playback",
        }),
    ],
    round: [percent !== undefined && field(el, m["label.rtp"], `${percent}%`)],
  };
};

/**
 * The cash-out control (W-24, W-57): "Cash out" with the Snapshot's
 * `cashOutValue` as `formatted` beside it when the Snapshot carries one (what
 * cashing out now credits, computed by the server), else with the Snapshot's
 * multiplier as a display value. Never an amount the Wrapper computed (W-34).
 * It takes the start control's place and width (RFC-005 section 5).
 */
export const cashOutButton = (
  el: Builder,
  localized: Localized,
  snapshot: SnapshotInput,
  cashOut: () => void,
): HTMLButtonElement => {
  const control = button(
    el,
    localized.messages["action.cashOut"],
    "cash-out",
    cashOut,
  );
  control.classList.add("se-start");
  const value = shownCashOutValue(snapshot);
  const shown =
    value?.formatted ??
    (snapshot.currentMultiplier === undefined
      ? undefined
      : formatMultiplier(localized.language, snapshot.currentMultiplier));
  if (shown !== undefined) {
    control.append(" ", el("span", { class: "se-button__value" }, [shown]));
  }
  return control;
};

/**
 * Whether the player owes a pick in a playable steps round: it is ready, the
 * shell offers no cash-out, and nothing is pending (RFC-005 section 5).
 */
export const owesPick = (
  snapshot: SnapshotInput,
  check: RoundCheck | undefined,
): boolean =>
  snapshot.presentation === "steps" &&
  check?.verdict === "ready" &&
  !check.cashOutOffered &&
  !check.outOfSync &&
  check.cancel === "none" &&
  check.pending === undefined &&
  check.unconfirmed === undefined;
