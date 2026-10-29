// What the page shows and does not check (V-13): the payout terms, the action
// key, and the links, record, and proofs a round may carry, as text; for a
// book round (V-20), its mode, drawn row, table, cost, and package hash, a
// field the body does not carry shown as "not reported".

import type { Detail } from "./check-result.ts";
import type { Child } from "./dom.ts";
import { MESSAGES as M } from "./messages.ts";
import type {
  BookEvidence,
  DrawnRowEvidence,
  RoundEvidence,
  ZkProofEvidence,
} from "./round-evidence.ts";
import { type Parts, paragraph, rows } from "./view-parts.ts";

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

const MILLI = 1000n;

/**
 * A multiplier in thousandths as a decimal multiplier with three places (`1940`
 * is `1.940×`), by `bigint` arithmetic, never a JS `number` (V-20).
 */
export const formatMultiplierMilli = (milli: string): string => {
  const value = BigInt(milli);
  const fraction = (value % MILLI).toString().padStart(3, "0");
  return `${(value / MILLI).toString()}.${fraction}×`;
};

const reportedOr = (value: string | undefined): string =>
  value ?? M["notChecked.notReported"];

const rowEntries = (
  index: string,
  multiplier: string,
  row: DrawnRowEvidence | undefined,
): Detail[] => [
  { label: index, value: reportedOr(row?.index.toString()) },
  {
    label: multiplier,
    value: reportedOr(
      row === undefined
        ? undefined
        : formatMultiplierMilli(row.multiplierMilli),
    ),
  },
];

/** V-20: a book round's values, each shown and not checked. */
const bookRows = (book: BookEvidence): Detail[] => [
  { label: M["notChecked.mode"], value: book.mode },
  ...rowEntries(
    M["notChecked.drawnIndex"],
    M["notChecked.drawnMultiplier"],
    book.drawn,
  ),
  ...rowEntries(
    M["notChecked.apiDrawIndex"],
    M["notChecked.apiDrawMultiplier"],
    book.apiDraw,
  ),
  { label: M["notChecked.cost"], value: reportedOr(book.cost) },
  { label: M["notChecked.merkleRoot"], value: reportedOr(book.merkleRoot) },
  {
    label: M["notChecked.entryCount"],
    value: reportedOr(book.entryCount?.toString()),
  },
  {
    label: M["notChecked.totalWeight"],
    value: reportedOr(book.totalWeight?.toString()),
  },
  { label: M["notChecked.packageHash"], value: book.packageHash },
  { label: M["notChecked.binding"], value: M["check.notChecked"] },
];

/** V-13: what the page shows and does not check. */
const notCheckedRows = (evidence: RoundEvidence): Detail[] => {
  const { randomnessProof, fairnessProof, createRoundAuth, record } = evidence;
  const out: Detail[] =
    evidence.book === undefined ? [] : bookRows(evidence.book);
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
  if (randomnessProof?.blockExplorerUrl !== undefined) {
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
    ...zkRows(M["notChecked.randomnessZk"], randomnessProof?.zkProof),
    ...zkRows(M["notChecked.fairnessZk"], fairnessProof?.zkProof),
  );
  return out;
};

export const notCheckedSection = (
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
