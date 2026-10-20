// Check 6 of V-12: block N's hash read from the entropy chain by a quorum
// (`chain-read.ts`, D-1), compared with the evidence's optional `blockValue`.
// The hash the quorum agreed on is the one check 7 uses.

import {
  type ChainRead,
  type ChainReadDeps,
  type ChainReadFailure,
  readBlockHashByQuorum,
  resolveBlockValue,
} from "./chain-read.ts";
import {
  type CheckResult,
  CHECK_TITLES,
  compare,
  type Detail,
  settled,
} from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import type { Hash32 } from "./hex.ts";
import type { RoundEvidence } from "./round-evidence.ts";

const CHAIN_FAILURES: Readonly<Record<ChainReadFailure, string>> = {
  config: "No usable endpoints are configured for this entropy source.",
  "other-chain": "An endpoint reports another chain than the pinned one.",
  "too-few": "Too few endpoints answered.",
  "no-chain-id": "An endpoint gave a block but no chain id.",
  "no-block": "An endpoint gave a chain id but no valid hash for block N.",
  "hash-mismatch": "The endpoints returned different hashes for block N.",
};

const answersOf = (read: ChainRead): Detail[] =>
  read.answers.flatMap(a => [
    {
      label: `${a.provider}: chain id`,
      value: a.chainId === undefined ? "no answer" : a.chainId.toString(),
    },
    { label: `${a.provider}: block hash`, value: a.blockHash ?? "no answer" },
  ]);

/** Check 6: block N's hash by a quorum read, beside the evidence's optional one. */
export const checkBlock = async (
  deps: ChainReadDeps,
  config: VerifyConfig,
  evidence: RoundEvidence,
): Promise<{ result: CheckResult; agreed: Hash32 | undefined }> => {
  const { source, blockNumber } = evidence.randomnessProof;
  const pinned = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  const read: ChainRead =
    pinned === undefined
      ? { ok: false, reason: "config", answers: [] }
      : await readBlockHashByQuorum(
          deps,
          {
            endpoints: pinned.endpoints,
            entropyChainId: pinned.chainId,
            minRpcQuorum: config.minRpcQuorum,
            environment: config.environment,
          },
          blockNumber,
        );
  if (!read.ok) {
    return {
      agreed: undefined,
      result: {
        id: 6,
        title: CHECK_TITLES[6],
        status: "unverified",
        comparisons: [],
        note: CHAIN_FAILURES[read.reason],
        details: answersOf(read),
        chainFailure: read.reason,
      },
    };
  }
  const block = resolveBlockValue(
    read.blockHash,
    evidence.randomnessProof.blockValue,
  );
  const absent = block.evidence === "absent";
  return {
    agreed: read.blockHash,
    result: settled(
      6,
      absent
        ? [compare("block hash (chain)", read.blockHash, read.blockHash)]
        : [
            compare(
              "randomnessProof.blockValue",
              read.blockHash,
              evidence.randomnessProof.blockValue,
            ),
          ],
      {
        details: answersOf(read),
        degraded: read.degraded,
        note: absent
          ? "The evidence carries no block hash; the chain's is used."
          : undefined,
      },
    ),
  };
};
