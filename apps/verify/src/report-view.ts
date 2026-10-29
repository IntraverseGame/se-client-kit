// The report states (V-6 to V-8, V-13): the page's verdict, its checks with
// the two values each compared, and what it shows but does not check. Links
// from the API are text, never followed.

import type { CheckResult, Detail } from "./check-result.ts";
import type { Child } from "./dom.ts";
import type { Comparison } from "./fairness-checks.ts";
import { MESSAGES as M } from "./messages.ts";
import { notCheckedSection } from "./not-checked-view.ts";
import { isOneStepTwoOptions } from "./round-evidence.ts";
import { ENDED, type RoundReport, type Verdict } from "./round-report.ts";
import {
  iconOf,
  type Parts,
  paragraph,
  retryButton,
  row,
  rows,
  STATUS_ICON,
  STATUS_TEXT,
  type View,
} from "./view-parts.ts";

const comparison = (p: Parts, c: Comparison): HTMLElement =>
  p.el(
    "div",
    {
      class: `vp-comparison vp-comparison--${c.matches ? "matches" : "mismatch"}`,
    },
    [
      p.el("p", { class: "vp-comparison__name" }, [
        iconOf(p, c.matches ? "matches" : "mismatch"),
        " ",
        p.el("span", {}, [c.name]),
        ": ",
        M[c.matches ? "check.matches" : "check.mismatch"],
      ]),
      p.el("dl", { class: "vp-rows" }, [
        row(
          p,
          `${c.name}, ${c.labels?.recomputed ?? M["checks.recomputed"]}`,
          c.recomputed ?? M["checks.absent"],
        ),
        row(
          p,
          `${c.name}, ${c.labels?.evidence ?? M["checks.evidence"]}`,
          c.evidence ?? M["checks.absent"],
        ),
      ]),
    ],
  );

const check = (p: Parts, result: CheckResult): HTMLElement =>
  p.el("li", { class: `vp-check vp-check--${result.status}` }, [
    p.el("h3", { class: "vp-check__title" }, [
      iconOf(p, STATUS_ICON[result.status]),
      " ",
      p.el("span", {}, [
        `${result.id}. ${result.title}: ${M[STATUS_TEXT[result.status]]}`,
      ]),
    ]),
    result.degraded === true &&
      p.el("p", { class: "vp-degraded" }, [
        iconOf(p, "unverified"),
        " ",
        M["check.degraded"],
      ]),
    result.note !== undefined && paragraph(p, [result.note]),
    ...result.comparisons.map(c => comparison(p, c)),
    rows(p, result.details ?? []),
  ]);

const checksList = (
  p: Parts,
  checks: readonly CheckResult[],
): readonly Child[] => [
  p.el("h2", { class: "vp-subheading" }, [M["checks.heading"]]),
  p.el(
    "ol",
    { class: "vp-checks" },
    checks.map(c => check(p, c)),
  ),
];

/**
 * V-20: a book round's result and payout, each labelled as the verify API's,
 * never as established.
 */
const reported = (report: RoundReport): Detail[] => {
  const { evidence } = report;
  if (!ENDED.has(evidence.status)) return [];
  const as = `(${M["round.asReported"]})`;
  return [
    {
      label: `${M["round.result"]} ${as}`,
      value: M[`result.${evidence.status as "won" | "lost" | "canceled"}`],
    },
    ...(evidence.payout === undefined
      ? []
      : [
          {
            label: `${M["round.payout"]} ${as}`,
            value: evidence.payout.formatted,
          },
        ]),
  ];
};

/**
 * V-6: the round id, the shape, the result, and the payout (a Coin Flip round's
 * `won` or `lost` payout was recomputed by check 7, OQ-B9; any other payout is
 * labelled not checked); for V-20's book reason (`asReported`), the result and
 * the payout labelled as the verify API's.
 */
const summary = (
  p: Parts,
  report: RoundReport,
  established: boolean,
  asReported = false,
): HTMLElement => {
  const { evidence } = report;
  const entries: Detail[] = [{ label: M["round.id"], value: report.roundId }];
  if (evidence.book !== undefined) {
    entries.push({
      label: M["round.shape"],
      value: `${M["round.shapeBook"]} ${evidence.book.mode}`,
    });
  } else if (isOneStepTwoOptions(evidence)) {
    entries.push({ label: M["round.shape"], value: M["round.shapeOneStep"] });
  }
  if (asReported) entries.push(...reported(report));
  if (
    established &&
    (evidence.status === "won" ||
      evidence.status === "lost" ||
      evidence.status === "canceled")
  ) {
    entries.push({
      label: M["round.result"],
      value: M[`result.${evidence.status}`],
    });
    if (evidence.status === "canceled" && evidence.closeReason !== undefined) {
      entries.push({ label: M["round.reason"], value: evidence.closeReason });
    }
    if (evidence.payout !== undefined) {
      const recomputed =
        evidence.book === undefined && evidence.status !== "canceled";
      entries.push({
        label: M["round.payout"],
        value: recomputed
          ? evidence.payout.formatted
          : `${evidence.payout.formatted} (${M["check.notChecked"]})`,
      });
    }
  }
  return p.el(
    "dl",
    { class: "vp-rows vp-summary" },
    entries.map(e => row(p, e.label, e.value)),
  );
};

const failedNames = (
  p: Parts,
  report: RoundReport,
  failed: readonly number[],
): HTMLElement =>
  p.el(
    "ul",
    { class: "vp-failed" },
    report.checks
      .filter(c => failed.includes(c.id))
      .map(c => p.el("li", {}, [`${c.id}. ${c.title}`])),
  );

export const reportView = (p: Parts, report: RoundReport): View => {
  const verdict: Verdict = report.verdict;
  const details = [
    ...checksList(p, report.checks),
    ...notCheckedSection(p, report.evidence),
  ];
  switch (verdict.kind) {
    case "matches":
      return {
        heading: M["matches.heading"],
        icon: "matches",
        body: [
          paragraph(p, [M["matches.text"]]),
          summary(p, report, true),
          ...details,
        ],
      };
    case "mismatch":
      return {
        heading: M["mismatch.heading"],
        icon: "mismatch",
        alert: [
          paragraph(p, [M["mismatch.text"]]),
          failedNames(p, report, verdict.failed),
        ],
        body: [summary(p, report, false), ...details],
      };
    case "chain-unverified":
      return {
        heading: M["chainUnverified.heading"],
        icon: "unverified",
        alert: [
          paragraph(p, [M["chainUnverified.text"]]),
          failedNames(p, report, [6]),
        ],
        body: [
          retryButton(p, "action.checkAgain"),
          summary(p, report, false),
          ...details,
        ],
      };
    default:
      // "not-recomputable"
      switch (verdict.reason) {
        case "not-ended":
          return {
            heading: M["notEnded.heading"],
            icon: "info",
            body: [
              paragraph(p, [M["notEnded.text"]]),
              retryButton(p, "action.checkAgain"),
              summary(p, report, false),
              ...details,
            ],
          };
        case "voided":
        case "refused":
          return {
            heading: M[`${verdict.reason}.heading`],
            icon: "info",
            body: [
              paragraph(p, [M[`${verdict.reason}.text`]]),
              summary(p, report, false),
              ...details,
            ],
          };
        case "book-draw":
          // V-20: an ended book round whose draw was not recomputed; nothing
          // to check again, since the same evidence gives the same answer.
          return {
            heading: M["bookDraw.heading"],
            icon: "info",
            body: [
              paragraph(p, [M["bookDraw.text"]]),
              summary(p, report, false, true),
              ...details,
            ],
          };
        case "unknown-kernel":
          return {
            heading: M["unknownKernel.heading"],
            icon: "info",
            body: [
              paragraph(p, [
                M["unknownKernel.text"],
                " ",
                String(report.evidence.kernelVersion),
              ]),
              summary(p, report, false),
              ...details,
            ],
          };
        default:
          // "unsupported-shape"
          return {
            heading: M["unsupportedShape.heading"],
            icon: "info",
            body: [
              paragraph(p, [M["unsupportedShape.text"]]),
              summary(p, report, false),
              ...details,
            ],
          };
      }
  }
};
