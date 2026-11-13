// The round as its status gives it (W-31 to W-34), in the control bar's slots
// (W-57, RFC-005): the status line (with the multiplier, which never
// truncates), the bet stepper and the start control when `idle` and beside the
// result of a round that is over, the cash-out control in the start control's
// place when the shell offers it, with the Snapshot's `cashOutValue` as
// `formatted` beside it when the Snapshot carries one, else the multiplier
// (round-amounts.ts says which), the pick prompt while the first pick is owed,
// and the round line (the payout and `closeReason`'s line). The balance is the
// bar's own slot. An `active` round is shown as ready only once the shell's
// checks passed (W-26); until then it reads as being prepared, under the
// stage's scrim. After the shell's own cancel (W-25, W-33), `ended` is a
// neutral "round ended" with no result claim, and a `canceled` result is the
// round failed verification and canceled (W-26). A move or cash-out not
// confirmed (W-16) shows its own state in place of the `active` round. Money
// is the Snapshot's `formatted`; a choice compares `value` as a `bigint`
// (bet-options.ts). A `won` round shows its `payout` as `formatted`, and a
// `lost` one only when `payout.value` is above 0 (compared as a `bigint`); an
// absent `payout` shows nothing. None is ever computed (W-31, W-34). A book
// round (`playback`, W-54) shows its mode's return to player in the round
// line, from `config.rtp.decimal` by string operations (W-56); never an amount
// from the draw's `payoutMultiplier`, the bet, or the RTP.

import { endedView } from "./cancel-views.ts";
import {
  type BarParts,
  type Builder,
  type Child,
  field,
  heading,
  STATUS_HEADING_ID,
} from "./dom.ts";
import type { IconName } from "./icons.ts";
import type { Localized, MessageKey } from "./messages.ts";
import { formatMultiplier, shownPayout } from "./round-amounts.ts";
import {
  type BarContext,
  cashOutButton,
  nextBet,
  owesPick,
} from "./round-controls.ts";
import {
  type RoundCheck,
  roundEnded,
  type SnapshotInput,
} from "./round-input.ts";
import { pickPrompt } from "./start-control.ts";
import { unconfirmedView } from "./unconfirmed-view.ts";
import type { Intents } from "./view-options.ts";

export type { BarContext };

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

/** The status line: the state's heading and at most one line of detail. */
export const statusLine = (
  el: Builder,
  title: HTMLElement,
  detail: string | undefined,
): Child[] => [
  title,
  detail !== undefined && el("p", { class: "se-detail" }, [detail]),
];

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

/** The pieces of a round's own state, before the next bet joins them. */
type Own = {
  readonly multiplier: Child[];
  readonly controls: Child[];
  readonly round: Child[];
  readonly detail: string | undefined;
};

const ownOf = (
  el: Builder,
  doc: Document,
  localized: Localized,
  snapshot: SnapshotInput,
  intents: Intents,
  check: RoundCheck | undefined,
  verifying: boolean,
): Own => {
  const m = localized.messages;
  const own: Own = {
    multiplier: [],
    controls: [],
    round: [],
    detail: undefined,
  };
  switch (verifying ? "verifying" : snapshot.status) {
    case "starting":
    case "resolving": {
      return {
        ...own,
        detail:
          m[`detail.${snapshot.status as "starting" | "resolving"}` as const],
      };
    }
    case "active": {
      if (snapshot.currentMultiplier !== undefined) {
        own.multiplier.push(
          field(
            el,
            m["label.multiplier"],
            formatMultiplier(localized.language, snapshot.currentMultiplier),
          ),
        );
      }
      const { cashOut } = intents;
      if (check?.cashOutOffered === true && cashOut !== undefined) {
        own.controls.push(cashOutButton(el, localized, snapshot, cashOut));
        return own;
      }
      // The first pick is owed: its words hold the control's place, and the
      // status line says them too (RFC-005 section 5).
      return owesPick(snapshot, check)
        ? {
            ...own,
            controls: [pickPrompt(el, doc, m)],
            detail: m["start.pickDetail"],
          }
        : own;
    }
    case "won":
    case "lost":
    case "canceled": {
      const payout = shownPayout(snapshot);
      if (payout !== undefined) {
        own.round.push(field(el, m["label.payout"], payout.formatted));
      }
      return { ...own, detail: resultDetail(m, snapshot, check) };
    }
    default: {
      return own;
    }
  }
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
  bar: BarContext,
  check?: RoundCheck,
  cancelEnded: boolean = check?.cancel === "ended",
  detail?: string,
): BarParts => {
  const m = localized.messages;
  if (cancelEnded) {
    const ended = endedView(
      el,
      doc,
      m,
      nextBet(el, doc, m, snapshot, intents, bar, "action.playAgain"),
    );
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
  const own = ownOf(el, doc, localized, snapshot, intents, check, verifying);
  const round = [...own.round];
  if (snapshot.closeReason === "expired") {
    round.push(
      el("p", { class: "se-detail se-detail--close" }, [m["detail.expired"]]),
    );
  }
  // A round that is over offers the next bet beside its result, from its own
  // Snapshot's `bet` (W-31, W-40): the read keeps showing the ended round until
  // the next start.
  const next =
    snapshot.status === "idle" || roundEnded(snapshot, check?.cancel)
      ? nextBet(el, doc, m, snapshot, intents, bar)
      : undefined;
  const shownDetail = detail ?? own.detail;
  return {
    status: [
      title,
      ...own.multiplier,
      shownDetail !== undefined &&
        el("p", { class: "se-detail" }, [shownDetail]),
    ],
    bet: next?.bet ?? [],
    controls: [...own.controls, ...(next?.controls ?? [])],
    round: [...round, ...(next?.round ?? [])],
  };
};
