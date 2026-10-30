// The round as its status gives it (W-31 to W-34), in the control bar's slots
// (W-57): the status line, the primary controls (the bet selector when `idle`
// and beside the result of a round that is over, the cash-out control when the
// shell offers it, with the multiplier beside it), and the round line (the
// multiplier, the payout, the balance, and `closeReason`'s line). An `active`
// round is shown as ready only once the shell's checks passed (W-26); until
// then it reads as being prepared, under the stage's scrim. After the shell's own cancel (W-25, W-33), `ended`
// is a neutral "round ended" with no result claim, and a `canceled` result is
// the round failed verification and canceled (W-26). A move or cash-out not
// confirmed (W-16) shows its own state in place of the `active` round. Money
// is the Snapshot's `formatted`; a choice compares `value` as a `bigint`
// (bet-options.ts). A `won` round shows its `payout` as `formatted`, and a
// `lost` one only when `payout.value` is above 0 (compared as a `bigint`); an
// absent `payout` shows nothing. None is ever computed (W-31, W-34). A book
// round (`playback`, W-54) shows its mode's return to player beside the bet
// selector, from `config.rtp.decimal` by string operations (W-56); never an
// amount from the draw's `payoutMultiplier`, the bet, or the RTP.

import { unitsOf } from "./bet-options.ts";
import { betSelector } from "./bet-selector.ts";
import { endedView } from "./cancel-views.ts";
import {
  type BarParts,
  button,
  type Builder,
  type Child,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { IconName } from "./icons.ts";
import type { Localized, MessageKey } from "./messages.ts";
import {
  type RoundCheck,
  roundEnded,
  type ShownAmount,
  type SnapshotInput,
} from "./round-input.ts";
import { rtpPercent } from "./rtp.ts";
import { unconfirmedView } from "./unconfirmed-view.ts";
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

/**
 * The payout a result shows (W-31): a `won` round's, and a `lost` round's only
 * when it credits something (`value` above 0, compared as a `bigint`, W-34).
 * None on any other status, none when the Snapshot carries none, and none when
 * `value` is not a base-units string (the validator rules that out; the guard
 * keeps a bad value from throwing, as `bet-options.ts` does).
 */
export const shownPayout = (
  snapshot: SnapshotInput,
): ShownAmount | undefined => {
  const { payout, status } = snapshot;
  if (payout === undefined) return undefined;
  const units = unitsOf(payout);
  if (units === undefined) return undefined;
  if (status === "won") return payout;
  return status === "lost" && units > 0n ? payout : undefined;
};

/**
 * The bet selector, and beside it a book round's return to player when its
 * Snapshot carries `config.rtp` (W-56): "Return to player: 96.00%". None when
 * it is absent, with no error.
 */
const betWithRtp = (
  el: Builder,
  m: Localized["messages"],
  snapshot: SnapshotInput,
  intents: Intents,
): Child[] => {
  const decimal =
    snapshot.presentation === "playback"
      ? snapshot.config.rtp?.decimal
      : undefined;
  const percent = decimal === undefined ? undefined : rtpPercent(decimal);
  return [
    betSelector(el, m, snapshot, intents),
    percent !== undefined && field(el, m["label.rtp"], `${percent}%`),
  ];
};

export const formatMultiplier = (
  language: string,
  multiplier: number,
): string =>
  `×${new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(multiplier)}`;

/** The status line: the state's heading and at most one line of detail. */
export const statusLine = (
  el: Builder,
  title: HTMLElement,
  detail: string | undefined,
): Child[] => [
  title,
  detail !== undefined && el("p", { class: "se-detail" }, [detail]),
];

/**
 * The cash-out control (W-24): "Cash out" with the Snapshot's multiplier beside
 * it as a display value, never an amount (W-34, W-57).
 */
const cashOutButton = (
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
  if (snapshot.currentMultiplier !== undefined) {
    control.append(
      " ",
      el("span", { class: "se-button__value" }, [
        formatMultiplier(localized.language, snapshot.currentMultiplier),
      ]),
    );
  }
  return control;
};

/** The result's own line (W-33, W-54), when it has one. */
const resultDetail = (
  m: Localized["messages"],
  snapshot: SnapshotInput,
  check: RoundCheck | undefined,
): string | undefined => {
  // After the shell's required cancel (W-26, W-33; decided in human review,
  // 2026-10-19): `canceled` is the round failed verification and canceled,
  // or, when the time limit had closed it first (`closeReason: "expired"`,
  // the cancel never honored), only failed verification, with the time
  // limit's line in the round line; `won` or `lost` is a round that closed by
  // play before the cancel arrived, so its result shows with that note.
  const afterCancel = check?.cancel === "sent";
  if (snapshot.status === "canceled") {
    const unverified =
      snapshot.closeReason === "expired"
        ? m["detail.unverified"]
        : m["detail.canceledUnverified"];
    return afterCancel ? unverified : m["detail.canceled"];
  }
  if (afterCancel) return m["detail.closedBeforeCancel"];
  // A changed book round (W-52) that is over: its result, with the failure
  // beside it, as the closed-before-cancel line (W-54).
  return snapshot.presentation === "playback" &&
    check?.verdict === "verification-failed"
    ? m["detail.unverified"]
    : undefined;
};

/**
 * The round as its status gives it (W-31 to W-34), in the bar's slots (W-57).
 * `detail`, when given, replaces the status line's detail: the slow notice
 * (W-35) or the waiting detail of a pending move (W-16).
 */
export const roundView = (
  el: Builder,
  doc: Document,
  localized: Localized,
  snapshot: SnapshotInput,
  intents: Intents,
  check?: RoundCheck,
  cancelEnded: boolean = check?.cancel === "ended",
  detail?: string,
): BarParts => {
  const m = localized.messages;
  const balance = field(el, m["label.balance"], snapshot.bet.balance.formatted);
  if (cancelEnded) {
    const ended = endedView(el, doc, m, snapshot, intents);
    return {
      ...ended,
      status: statusLine(el, ended.heading, detail),
    };
  }
  // An `active` round the shell has not passed is not shown as ready (W-26):
  // it reads as being prepared, under the stage's scrim (W-57).
  const verifying =
    snapshot.status === "active" && check?.verdict === "checking";
  // The move or cash-out whose one resend was lost too (W-16).
  if (
    !verifying &&
    snapshot.status === "active" &&
    check?.unconfirmed !== undefined
  ) {
    return unconfirmedView(
      el,
      doc,
      m,
      check.unconfirmed,
      snapshot.roundId,
      intents,
    );
  }
  const shownStatus = verifying ? "starting" : snapshot.status;
  const iconName = STATUS_ICON[shownStatus];
  const title = heading(
    el,
    doc,
    "h1",
    STATUS_HEADING_ID,
    m[`status.${shownStatus}` as const],
    iconName,
    iconName === undefined ? "" : m[ICON_LABEL[iconName]],
  );
  const controls: Child[] = [];
  const round: Child[] = [];
  let own: string | undefined;
  switch (verifying ? "verifying" : snapshot.status) {
    case "idle": {
      round.push(balance);
      controls.push(...betWithRtp(el, m, snapshot, intents));
      break;
    }
    case "starting":
    case "resolving": {
      own = m[`detail.${snapshot.status as "starting" | "resolving"}` as const];
      round.push(balance);
      break;
    }
    case "verifying": {
      round.push(balance);
      break;
    }
    case "active": {
      if (snapshot.currentMultiplier !== undefined) {
        round.push(
          field(
            el,
            m["label.multiplier"],
            formatMultiplier(localized.language, snapshot.currentMultiplier),
          ),
        );
      }
      round.push(balance);
      const { cashOut } = intents;
      if (check?.cashOutOffered === true && cashOut !== undefined) {
        controls.push(cashOutButton(el, localized, snapshot, cashOut));
      }
      break;
    }
    case "won":
    case "lost":
    case "canceled": {
      own = resultDetail(m, snapshot, check);
      const payout = shownPayout(snapshot);
      if (payout !== undefined) {
        round.push(field(el, m["label.payout"], payout.formatted));
      }
      round.push(balance);
      break;
    }
    default: {
      break;
    }
  }
  if (snapshot.closeReason === "expired") {
    round.push(
      el("p", { class: "se-detail se-detail--close" }, [m["detail.expired"]]),
    );
  }
  // A round that is over offers the next bet beside its result, from its own
  // Snapshot's `bet` (W-31, W-40): the read keeps showing the ended round until
  // the next start.
  if (roundEnded(snapshot, check?.cancel)) {
    controls.push(...betWithRtp(el, m, snapshot, intents));
  }
  return {
    status: statusLine(el, title, detail ?? own),
    controls,
    round,
  };
};
