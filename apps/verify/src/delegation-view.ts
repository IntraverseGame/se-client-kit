// What check 9 shows of the round's key delegation (V-22), under its heading
// "Wallet link": the statement, the signed text as text (never markup), the
// wallet in full, the notice's id and its status in this page's list, the
// expiry and `acceptedAt` as dates and times in the browser's locale and time
// zone with the unix seconds beside them, the items not checked, and what the
// link means and does not. The comparisons are the check's own.

import type { DelegationShown } from "./check-result.ts";
import type { Child } from "./dom.ts";
import { MESSAGES as M } from "./messages.ts";
import { iconOf, type Parts, paragraph, rows } from "./view-parts.ts";

/**
 * Unix seconds as a date and time in the browser's locale and time zone, with
 * the seconds beside it; the seconds alone past the dates a `Date` holds.
 */
export const dateAndSeconds = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  const shown = `${String(seconds)} ${M["delegation.seconds"]}`;
  return Number.isNaN(date.getTime())
    ? shown
    : `${date.toLocaleString()} (${shown})`;
};

export const delegationPart = (
  p: Parts,
  shown: DelegationShown,
): readonly Child[] => [
  paragraph(p, [M["delegation.statement"]]),
  p.el("blockquote", { class: "vp-notice" }, [shown.notice]),
  rows(p, [
    { label: M["delegation.wallet"], value: shown.wallet },
    { label: M["delegation.noticeId"], value: shown.noticeId },
    {
      label: M["delegation.listed"],
      value:
        shown.listed === "unlisted" ? M["delegation.unlisted"] : shown.listed,
    },
    { label: M["delegation.expiry"], value: dateAndSeconds(shown.expiry) },
    {
      label: M["delegation.acceptedAt"],
      value: dateAndSeconds(shown.acceptedAt),
    },
  ]),
  ...shown.unchecked.map(item =>
    p.el("p", { class: "vp-text vp-unchecked" }, [
      iconOf(p, "not-checked"),
      " ",
      item,
    ]),
  ),
  paragraph(p, [M["delegation.means"]]),
];
