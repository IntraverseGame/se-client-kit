// The bet selector and the start control (W-31): shown when the Snapshot is
// `idle`, and beside the result of a round that is over (`won`, `lost`,
// `canceled`, or the shell's cancel `ended`), drawn from that Snapshot's own
// `bet` block. The options and the comparisons are bet-options.ts's (W-34).

import { betChoice } from "./bet-options.ts";
import { button, type Builder } from "./dom.ts";
import type { Messages } from "./messages.ts";
import type { SnapshotInput } from "./round-input.ts";
import type { Intents } from "./view-options.ts";

/**
 * The bet selector and the start control, from `snapshot.bet`, preset to
 * `defaultBet` (W-31). The control reads "Place bet" at `idle` and "Play again"
 * beside a result (W-57).
 */
export const betSelector = (
  el: Builder,
  m: Messages,
  snapshot: SnapshotInput,
  intents: Intents,
  label: "action.placeBet" | "action.playAgain" = snapshot.status === "idle"
    ? "action.placeBet"
    : "action.playAgain",
): HTMLElement => {
  const choice = betChoice(snapshot.bet);
  let selected = choice.selected;
  const radios = choice.options.map((option, index) => {
    const input = el("input", {
      type: "radio",
      name: "se-bet",
      value: String(index),
      "data-focus-key": `bet-${index}`,
    });
    input.checked = index === selected;
    input.disabled = !option.affordable;
    input.addEventListener("change", () => {
      selected = index;
    });
    return el("label", { class: "se-choice" }, [
      input,
      " ",
      option.amount.formatted,
      !option.affordable &&
        el("span", { class: "se-choice__note" }, [
          ` (${m["label.betUnavailable"]})`,
        ]),
    ]);
  });
  const start = intents.start;
  return el("form", { class: "se-bet" }, [
    el("fieldset", {}, [el("legend", {}, [m["label.bet"]]), ...radios]),
    start !== undefined &&
      button(
        el,
        m[label],
        "start",
        () => {
          const option =
            selected === undefined ? undefined : choice.options[selected];
          if (option !== undefined) {
            start(option.amount);
          }
        },
        selected === undefined,
      ),
  ]);
};
