// The round as its status gives it (W-31 to W-34): the bet selector when
// `idle`, the preparing and resolving notes, the multiplier, the cash-out
// control when the shell offers it, the result, and `closeReason` beside the
// status. An `active` round is shown as ready only once the shell's checks
// passed (W-26); until then it reads as being checked. Money is the
// Snapshot's `formatted`; a choice compares `value` as a `bigint`
// (bet-options.ts). No payout is shown on `won`: the Snapshot carries none yet
// (TODO(Snapshot contract) in the rendering spec), and none is ever computed.

import { betChoice } from "./bet-options.ts";
import {
  button,
  type Builder,
  type Child,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { IconName } from "./icons.ts";
import type { Localized, MessageKey, Messages } from "./messages.ts";
import {
  type RoundCheck,
  roundIsOver,
  type SnapshotInput,
} from "./round-input.ts";
import type { Intents } from "./view-options.ts";

const STATUS_ICON: Partial<Record<SnapshotInput["status"], IconName>> = {
  won: "win",
  lost: "loss",
  canceled: "info",
  starting: "progress",
  resolving: "progress",
};

export const ICON_LABEL: Readonly<Record<IconName, MessageKey>> = {
  win: "icon.win",
  loss: "icon.loss",
  error: "icon.error",
  info: "icon.info",
  progress: "icon.progress",
};

const formatMultiplier = (language: string, multiplier: number): string =>
  `×${new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(multiplier)}`;

/** The bet selector and the start control (`idle`, W-31). */
const betSelector = (
  el: Builder,
  m: Messages,
  snapshot: SnapshotInput,
  intents: Intents,
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
        m["action.start"],
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

/** The round as its status gives it (W-31 to W-34). */
export const roundView = (
  el: Builder,
  doc: Document,
  localized: Localized,
  snapshot: SnapshotInput,
  intents: Intents,
  check?: RoundCheck,
): Child[] => {
  const m = localized.messages;
  // An `active` round the shell has not passed is not shown as ready (W-26).
  // A round the shell does not hold (no check) is shown as it is, never with
  // the game or a control (W-42).
  const verifying =
    snapshot.status === "active" && check?.verdict === "checking";
  const shownStatus = verifying ? "starting" : snapshot.status;
  const iconName = STATUS_ICON[shownStatus];
  const children: Child[] = [
    heading(
      el,
      doc,
      "h1",
      STATUS_HEADING_ID,
      m[`status.${shownStatus}` as const],
      iconName,
      iconName === undefined ? "" : m[ICON_LABEL[iconName]],
    ),
  ];
  if (verifying) {
    children.push(
      el("p", { class: "se-detail" }, [m["detail.verifying"]]),
      field(el, m["label.balance"], snapshot.bet.balance.formatted),
    );
    return children;
  }
  switch (snapshot.status) {
    case "idle": {
      children.push(
        field(el, m["label.balance"], snapshot.bet.balance.formatted),
        betSelector(el, m, snapshot, intents),
      );
      break;
    }
    case "starting":
    case "resolving": {
      children.push(
        el("p", { class: "se-detail" }, [
          m[`detail.${snapshot.status}` as const],
        ]),
        field(el, m["label.balance"], snapshot.bet.balance.formatted),
      );
      break;
    }
    case "active": {
      if (snapshot.currentMultiplier !== undefined) {
        children.push(
          field(
            el,
            m["label.multiplier"],
            formatMultiplier(localized.language, snapshot.currentMultiplier),
          ),
        );
      }
      children.push(
        field(el, m["label.balance"], snapshot.bet.balance.formatted),
      );
      const { cashOut } = intents;
      if (check?.cashOutOffered === true && cashOut !== undefined) {
        children.push(button(el, m["action.cashOut"], "cash-out", cashOut));
      }
      break;
    }
    case "won":
    case "lost":
    case "canceled": {
      if (snapshot.status === "canceled") {
        children.push(el("p", { class: "se-detail" }, [m["detail.canceled"]]));
      }
      children.push(
        field(el, m["label.balance"], snapshot.bet.balance.formatted),
      );
      break;
    }
    default: {
      break;
    }
  }
  if (snapshot.closeReason === "expired") {
    children.push(
      el("p", { class: "se-detail se-detail--close" }, [m["detail.expired"]]),
    );
  }
  const newRound = intents.newRound;
  if (roundIsOver(snapshot) && newRound !== undefined) {
    children.push(button(el, m["action.newRound"], "new-round", newRound));
  }
  return children;
};
