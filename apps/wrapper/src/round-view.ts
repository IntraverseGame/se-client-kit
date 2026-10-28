// The round as its status gives it (W-31 to W-34): the bet selector when
// `idle` and beside the result of a round that is over, the preparing and
// resolving notes, the multiplier, the cash-out control when the shell offers
// it, the result, and `closeReason` beside the status. An `active` round is
// shown as ready only once the shell's checks passed (W-26); until then it
// reads as being checked. After the shell's own cancel (W-25, W-33), `ended`
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

const formatMultiplier = (language: string, multiplier: number): string =>
  `×${new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(multiplier)}`;

/** The round as its status gives it (W-31 to W-34). */
export const roundView = (
  el: Builder,
  doc: Document,
  localized: Localized,
  snapshot: SnapshotInput,
  intents: Intents,
  check?: RoundCheck,
  cancelEnded: boolean = check?.cancel === "ended",
): Child[] => {
  const m = localized.messages;
  if (cancelEnded) {
    return endedView(el, doc, m, snapshot, intents);
  }
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
  // The move or cash-out whose one resend was lost too (W-16).
  if (snapshot.status === "active" && check?.unconfirmed !== undefined) {
    return unconfirmedView(
      el,
      doc,
      m,
      check.unconfirmed,
      snapshot.roundId,
      intents,
    );
  }
  switch (snapshot.status) {
    case "idle": {
      children.push(
        field(el, m["label.balance"], snapshot.bet.balance.formatted),
        ...betWithRtp(el, m, snapshot, intents),
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
      // After the shell's required cancel (W-26, W-33; decided in human
      // review, 2026-10-19): `canceled` is the round failed verification and
      // canceled, or, when the time limit had closed it first (`closeReason:
      // "expired"`, the cancel never honored), only failed verification, with
      // the time limit's line below; `won` or `lost` is a round that closed by
      // play before the cancel arrived, so its result shows with that note.
      const afterCancel = check?.cancel === "sent";
      if (snapshot.status === "canceled") {
        const unverified =
          snapshot.closeReason === "expired"
            ? m["detail.unverified"]
            : m["detail.canceledUnverified"];
        const detail = afterCancel ? unverified : m["detail.canceled"];
        children.push(el("p", { class: "se-detail" }, [detail]));
      } else if (afterCancel) {
        children.push(
          el("p", { class: "se-detail" }, [m["detail.closedBeforeCancel"]]),
        );
      } else if (
        snapshot.presentation === "playback" &&
        check?.verdict === "verification-failed"
      ) {
        // A changed book round (W-52) that is over: its result, with the
        // failure beside it, as the closed-before-cancel line (W-54).
        children.push(
          el("p", { class: "se-detail" }, [m["detail.unverified"]]),
        );
      }
      const payout = shownPayout(snapshot);
      if (payout !== undefined) {
        children.push(field(el, m["label.payout"], payout.formatted));
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
  // A round that is over offers the next bet beside its result, from its own
  // Snapshot's `bet` (W-31, W-40): the read keeps showing the ended round until
  // the next start.
  if (roundEnded(snapshot, check?.cancel)) {
    children.push(...betWithRtp(el, m, snapshot, intents));
  }
  return children;
};
