// The report states (V-6 to V-8, V-13): the page's verdict, its checks with
// the two values each compared, and what it shows but does not check. Links
// from the API are text, never followed.

import type { CheckResult, Detail } from "./check-result.ts";
import type { Child } from "./dom.ts";
import type { Comparison } from "./fairness-checks.ts";
import { MESSAGES as M } from "./messages.ts";
import {
  isOneStepTwoOptions,
  type RoundEvidence,
  type ZkProofEvidence,
} from "./round-evidence.ts";
import type { RoundReport, Verdict } from "./verify-round.ts";
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
          `${c.name}, ${M["checks.recomputed"]}`,
          c.recomputed ?? M["checks.absent"],
        ),
        row(
          p,
          `${c.name}, ${M["checks.evidence"]}`,
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

const zkRows = (label: string, zk: ZkProofEvidence | undefined): Detail[] =>
  zk === undefined
    ? []
    : [
        { label, value: zk.status },
        ...(zk.verifiedBy === undefined
          ? []
          : [
              {
                label: `${label}, ${M["notChecked.verifiedBy"]}`,
                value: zk.verifiedBy,
              },
            ]),
        ...(zk.proofLink === undefined
          ? []
          : [
              {
                label: `${label}, ${M["notChecked.proofLink"]}`,
                value: zk.proofLink,
              },
            ]),
      ];

/** V-13: what the page shows and does not check. */
const notCheckedRows = (evidence: RoundEvidence): Detail[] => {
  const { randomnessProof, fairnessProof, createRoundAuth, record } = evidence;
  const out: Detail[] = [];
  if (createRoundAuth !== undefined) {
    out.push({
      label: M["notChecked.payoutTermsHash"],
      value: createRoundAuth.newRound.payoutTermsHash,
    });
  }
  if (createRoundAuth !== undefined) {
    out.push({
      label: M["notChecked.actionKey"],
      value: createRoundAuth.newRound.actionKey,
    });
  }
  if (randomnessProof.blockExplorerUrl !== undefined) {
    out.push({
      label: M["notChecked.blockExplorer"],
      value: randomnessProof.blockExplorerUrl,
    });
  }
  if (record !== undefined) {
    out.push(
      { label: M["notChecked.recordTx"], value: record.txHash },
      { label: M["notChecked.recordChain"], value: String(record.chainId) },
    );
    if (record.explorerUrl !== undefined) {
      out.push({
        label: M["notChecked.recordExplorer"],
        value: record.explorerUrl,
      });
    }
  }
  out.push(
    ...zkRows(M["notChecked.randomnessZk"], randomnessProof.zkProof),
    ...zkRows(M["notChecked.fairnessZk"], fairnessProof?.zkProof),
  );
  return out;
};

const notCheckedSection = (
  p: Parts,
  evidence: RoundEvidence,
): readonly Child[] => {
  const entries = notCheckedRows(evidence);
  return entries.length === 0
    ? []
    : [
        p.el("h2", { class: "vp-subheading" }, [M["notChecked.heading"]]),
        paragraph(p, [M["notChecked.text"]]),
        rows(p, entries),
      ];
};

/** V-6: the round id, the shape, the result, and the payout (not checked). */
const summary = (
  p: Parts,
  report: RoundReport,
  established: boolean,
): HTMLElement => {
  const { evidence } = report;
  const entries: Detail[] = [{ label: M["round.id"], value: report.roundId }];
  if (isOneStepTwoOptions(evidence)) {
    entries.push({ label: M["round.shape"], value: M["round.shapeOneStep"] });
  }
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
      entries.push({
        label: M["round.payout"],
        value: `${evidence.payout.formatted} (${M["check.notChecked"]})`,
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
