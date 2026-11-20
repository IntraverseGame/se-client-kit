// Check 6 of V-12: block N's hash read from the entropy chain by a quorum
// (`chain-read.ts` for an EVM source, `chain-read-solana.ts` for a Solana one,
// by the source's kind; D-1), compared with the evidence's optional
// `blockValue`. The value the quorum agreed on is the one check 7 uses.

import {
  type SolanaEndpointAnswer,
  readSolanaValueByQuorum,
} from "./chain-read-solana.ts";
import {
  type ChainRead,
  type ChainReadDeps,
  type ChainReadFailure,
  type EndpointAnswer,
  readBlockHashByQuorum,
  resolveBlockValue,
} from "./chain-read.ts";
import {
  type CheckResult,
  CHECK_TITLES,
  compare,
  type Detail,
  notChecked,
  settled,
} from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import type { Hash32 } from "./hex.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import type { SourceConfig } from "./source-config.ts";

const CHAIN_FAILURES: Readonly<Record<ChainReadFailure, string>> = {
  config: "No usable endpoints are configured for this entropy source.",
  "other-chain": "An endpoint reports another chain than the pinned one.",
  "ledger-gap": "An endpoint's ledger has a gap at slot N.",
  "too-few": "Too few endpoints answered.",
  "no-chain-id": "An endpoint gave a block but no chain id.",
  "no-block": "An endpoint gave a chain id but no valid hash for block N.",
  "hash-mismatch": "The endpoints returned different hashes for block N.",
};

// A Solana cluster is known by its genesis hash, and N is a slot (RFC-007).
const SOLANA_FAILURES: Readonly<Record<ChainReadFailure, string>> = {
  ...CHAIN_FAILURES,
  "other-chain": "An endpoint reports another cluster's genesis hash.",
  "no-chain-id": "An endpoint gave a block but no genesis hash.",
  "no-block":
    "An endpoint gave the genesis hash but no valid block for slot N.",
  "hash-mismatch": "The endpoints returned different block values for slot N.",
};

type AnyAnswer = EndpointAnswer | SolanaEndpointAnswer;

const GENESIS: Readonly<Record<"pinned" | "other", string>> = {
  pinned: "this cluster",
  other: "another cluster",
};

const missingValue = (a: SolanaEndpointAnswer, slot: bigint): string => {
  if (a.missing === "not-available") {
    return `this provider does not serve slot ${slot.toString()}`;
  }
  if (a.missing === "ledger-gap") {
    return `its ledger has a gap at slot ${slot.toString()}`;
  }
  return "no answer";
};

const solanaDetails = (a: SolanaEndpointAnswer, slot: bigint): Detail[] => [
  {
    label: `${a.provider}: genesis hash`,
    value: a.genesis === undefined ? "no answer" : GENESIS[a.genesis],
  },
  {
    label: `${a.provider}: block value`,
    value: a.blockHash ?? missingValue(a, slot),
  },
  ...(a.fromSlot === undefined
    ? []
    : [
        {
          label: `${a.provider}: skipped slot`,
          value: `slot ${slot.toString()} was skipped; the value is the block at slot ${a.fromSlot.toString()}`,
        },
      ]),
];

const answersOf = (read: ChainRead<AnyAnswer>, blockNumber: bigint): Detail[] =>
  read.answers.flatMap(a =>
    "genesis" in a
      ? solanaDetails(a, blockNumber)
      : [
          {
            label: `${a.provider}: chain id`,
            value: a.chainId === undefined ? "no answer" : a.chainId.toString(),
          },
          {
            label: `${a.provider}: block hash`,
            value: a.blockHash ?? "no answer",
          },
        ],
  );

/** The quorum read of block N from the round's source, by its kind. */
const readSource = (
  deps: ChainReadDeps,
  config: VerifyConfig,
  pinned: SourceConfig | undefined,
  blockNumber: bigint,
  signal: AbortSignal | undefined,
): Promise<ChainRead<AnyAnswer>> => {
  if (pinned === undefined) {
    return Promise.resolve({ ok: false, reason: "config", answers: [] });
  }
  const quorum = {
    endpoints: pinned.endpoints,
    entropyChainId: pinned.chainId,
    minRpcQuorum: config.minRpcQuorum,
    environment: config.environment,
  };
  return pinned.kind === "solana"
    ? readSolanaValueByQuorum(
        deps,
        { ...quorum, genesisHash: pinned.genesisHash },
        blockNumber,
        signal,
      )
    : readBlockHashByQuorum(deps, quorum, blockNumber, signal);
};

/**
 * Check 6: block N's hash by a quorum read, beside the evidence's optional one.
 * Rejects with an `AbortError` when `signal` aborts (it is not a result).
 */
export const checkBlock = async (
  deps: ChainReadDeps,
  config: VerifyConfig,
  evidence: RoundEvidence,
  signal?: AbortSignal,
): Promise<{ result: CheckResult; agreed: Hash32 | undefined }> => {
  if (evidence.randomnessProof === undefined) {
    return {
      agreed: undefined,
      result: notChecked(6, "The round carries no entropy block yet."),
    };
  }
  const { source, blockNumber } = evidence.randomnessProof;
  const pinned = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  const read = await readSource(deps, config, pinned, blockNumber, signal);
  if (!read.ok) {
    return {
      agreed: undefined,
      result: {
        id: 6,
        title: CHECK_TITLES[6],
        status: "unverified",
        comparisons: [],
        note: (pinned?.kind === "solana" ? SOLANA_FAILURES : CHAIN_FAILURES)[
          read.reason
        ],
        details: answersOf(read, blockNumber),
        chainFailure: read.reason,
      },
    };
  }
  const block = resolveBlockValue(
    read.blockHash,
    evidence.randomnessProof.blockValue,
  );
  const absent = block.evidence === "absent";
  // A Solana block's value is its `blockhash`, read from base58 (RFC-007).
  const what = pinned?.kind === "solana" ? "block value" : "block hash";
  return {
    agreed: read.blockHash,
    result: settled(
      6,
      absent
        ? [compare(`${what} (chain)`, read.blockHash, read.blockHash)]
        : [
            compare(
              "randomnessProof.blockValue",
              read.blockHash,
              evidence.randomnessProof.blockValue,
            ),
          ],
      {
        details: answersOf(read, blockNumber),
        degraded: read.degraded,
        note: absent
          ? `The evidence carries no ${what}; the chain's is used.`
          : undefined,
      },
    ),
  };
};
