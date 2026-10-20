// What the page shows and does not check (V-13): the payout terms, the action
// key, and the links, record, and proofs a round may carry, as text.

import type { Detail } from "./check-result.ts";
import type { Child } from "./dom.ts";
import { MESSAGES as M } from "./messages.ts";
import type { RoundEvidence, ZkProofEvidence } from "./round-evidence.ts";
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
