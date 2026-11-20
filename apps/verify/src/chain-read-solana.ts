// Check 6 for a Solana source (RFC-007 section 4, V-12, D-1): slot N's value by
// a quorum read of the source's configured endpoints. Per endpoint, at once,
// `getGenesisHash` (the cluster's identity) and `getBlock` at N; when N was
// skipped, the value of the first finalized block after it, by the backend's
// rule, with its ledger-gap check. The EVM read (`chain-read.ts`) is unchanged.

import { isBase58Text } from "./base58.ts";
import {
  type ChainRead,
  type ChainReadConfig,
  type ChainReadDeps,
  type ChainReadFailure,
  configIsRefused,
  type RpcEndpoint,
  throwIfAborted,
} from "./chain-read.ts";
import type { Hash32 } from "./hex.ts";
import {
  FINALIZED,
  GET_BLOCK_OPTIONS,
  NOT_AVAILABLE_CODES,
  readBlock,
  readGenesisHash,
  readNextBlock,
  SKIPPED_CODES,
} from "./solana-answers.ts";
import { type SolanaReply, solanaCall } from "./solana-call.ts";

/** A Solana source's read: its quorum and, pinned in code, its genesis hash. */
export type SolanaReadConfig = ChainReadConfig & {
  /** The cluster's genesis hash (base58), for `entropyChainId`. */
  readonly genesisHash: string;
};

/**
 * Why an endpoint gave no value: `not-available` (`getBlock` at N or at M
 * answered -32004, -32001, -32014, or -32019), `ledger-gap` (the skip path
 * found a block the endpoint did not report, or contradicted itself), or
 * `no-answer` (anything else: no answer, another error, a null or refused
 * result, an empty `getBlocksWithLimit`). Never the error's message.
 */
export type SolanaMissing = "not-available" | "ledger-gap" | "no-answer";

/** What one Solana endpoint gave, recorded for the check's display. */
export type SolanaEndpointAnswer = {
  readonly provider: string;
  /**
   * `pinned`: the cluster's genesis hash; `other`: another well-formed one;
   * `undefined`: no answer, or not a genesis hash.
   */
  readonly genesis: "pinned" | "other" | undefined;
  /** Slot N's value as `0x` and 64 lowercase hex, or `undefined`. */
  readonly blockHash: Hash32 | undefined;
  /** The slot `M` the value came from when N was skipped, else `undefined`. */
  readonly fromSlot: bigint | undefined;
  /** Why there is no value, else `undefined`. */
  readonly missing: SolanaMissing | undefined;
};

type Value =
  | { readonly blockHash: Hash32; readonly fromSlot: bigint | undefined }
  | { readonly missing: SolanaMissing };

const notFound = (reply: SolanaReply): Value => ({
  missing:
    reply.kind === "error" && NOT_AVAILABLE_CODES.has(reply.code)
      ? "not-available"
      : "no-answer",
});

const isSkip = (reply: SolanaReply): boolean =>
  reply.kind === "error" && SKIPPED_CODES.has(reply.code);

const askBlock = (
  deps: ChainReadDeps,
  url: string,
  slot: bigint,
  signal: AbortSignal | undefined,
): Promise<SolanaReply> =>
  solanaCall(deps, url, "getBlock", [Number(slot), GET_BLOCK_OPTIONS], signal);

/**
 * N was skipped: the first finalized block `M` after N, by `getBlocksWithLimit`
 * then `getBlock(M)`, in order. `M ≤ N`, a skip answer for `M`, or `M`'s parent
 * at or after N is a ledger gap.
 */
const readAfterSkip = async (
  deps: ChainReadDeps,
  url: string,
  skipped: bigint,
  signal: AbortSignal | undefined,
): Promise<Value> => {
  const listed = await solanaCall(
    deps,
    url,
    "getBlocksWithLimit",
    [Number(skipped), 1, FINALIZED],
    signal,
  );
  const next =
    listed.kind === "result"
      ? readNextBlock(listed.result, skipped)
      : undefined;
  if (next === "gap") return { missing: "ledger-gap" };
  if (next === undefined || next === "none") return { missing: "no-answer" };
  const reply = await askBlock(deps, url, next, signal);
  if (isSkip(reply)) return { missing: "ledger-gap" };
  if (reply.kind !== "result") return notFound(reply);
  const block = readBlock(reply.result, next);
  if (block === undefined) return { missing: "no-answer" };
  if (block.parentSlot >= skipped) return { missing: "ledger-gap" };
  return { blockHash: block.value, fromSlot: next };
};

/** Slot N's value: its block's, or, when N was skipped, the next block's. */
const readValue = async (
  deps: ChainReadDeps,
  url: string,
  slot: bigint,
  signal: AbortSignal | undefined,
): Promise<Value> => {
  const reply = await askBlock(deps, url, slot, signal);
  if (isSkip(reply)) return readAfterSkip(deps, url, slot, signal);
  if (reply.kind !== "result") return notFound(reply);
  const block = readBlock(reply.result, slot);
  return block === undefined
    ? { missing: "no-answer" }
    : { blockHash: block.value, fromSlot: undefined };
};

const askEndpoint = async (
  deps: ChainReadDeps,
  config: SolanaReadConfig,
  endpoint: RpcEndpoint,
  slot: bigint,
  signal: AbortSignal | undefined,
): Promise<SolanaEndpointAnswer> => {
  const [genesisReply, value] = await Promise.all([
    solanaCall(deps, endpoint.url, "getGenesisHash", [], signal),
    readValue(deps, endpoint.url, slot, signal),
  ]);
  const reported =
    genesisReply.kind === "result"
      ? readGenesisHash(genesisReply.result)
      : undefined;
  const found = "blockHash" in value;
  return {
    provider: endpoint.provider,
    genesis:
      reported === undefined
        ? undefined
        : reported === config.genesisHash
          ? "pinned"
          : "other",
    blockHash: found ? value.blockHash : undefined,
    fromSlot: found ? value.fromSlot : undefined,
    missing: found ? undefined : value.missing,
  };
};

const MAX_SLOT = BigInt(Number.MAX_SAFE_INTEGER);

/** The first failure of the answers, in RFC-007 section 4's order. */
const failureOf = (
  answers: readonly SolanaEndpointAnswer[],
  minRpcQuorum: number,
): ChainReadFailure | undefined => {
  if (answers.some(a => a.genesis === "other")) return "other-chain";
  if (answers.some(a => a.genesis === "pinned" && a.missing === "ledger-gap")) {
    return "ledger-gap";
  }
  const values = answers.filter(a => a.blockHash !== undefined);
  if (values.length < minRpcQuorum) return "too-few";
  if (values.some(a => a.genesis === undefined)) return "no-chain-id";
  if (answers.some(a => a.genesis === "pinned" && a.blockHash === undefined)) {
    return "no-block";
  }
  const [first] = values;
  if (first === undefined) return "too-few";
  return values.some(a => a.blockHash !== first.blockHash)
    ? "hash-mismatch"
    : undefined;
};

/**
 * Slot `slot`'s value by a quorum read of a Solana source (V-12, check 6).
 * Passes only if no endpoint reports another genesis hash than the pinned one,
 * no endpoint on the pinned cluster saw a ledger gap, at least `minRpcQuorum`
 * endpoints gave a value, every one that did gave the genesis hash, every one
 * that gave the genesis hash gave a value, and all the values are the same. The
 * first failure in that order is the one returned; an outlier is never dropped
 * and no side is picked. When `signal` aborts, every request of the read ends,
 * the skip path's too, and the read rejects with an `AbortError`.
 */
export const readSolanaValueByQuorum = async (
  deps: ChainReadDeps,
  config: SolanaReadConfig,
  slot: bigint,
  signal?: AbortSignal,
): Promise<ChainRead<SolanaEndpointAnswer>> => {
  throwIfAborted(signal);
  if (
    configIsRefused(config) ||
    !isBase58Text(config.genesisHash) ||
    slot < 0n ||
    slot > MAX_SLOT
  ) {
    return { ok: false, reason: "config", answers: [] };
  }
  const answers = await Promise.all(
    config.endpoints.map(endpoint =>
      askEndpoint(deps, config, endpoint, slot, signal),
    ),
  );
  const reason = failureOf(answers, config.minRpcQuorum);
  const first = answers.find(a => a.blockHash !== undefined);
  if (reason !== undefined || first?.blockHash === undefined) {
    return { ok: false, reason: reason ?? "too-few", answers };
  }
  return {
    ok: true,
    blockHash: first.blockHash,
    degraded: config.minRpcQuorum === 1,
    answers,
  };
};
