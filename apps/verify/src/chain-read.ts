// Check 6 (block N), specs/verify-page.md V-12 and D-1: block N's hash by a
// quorum read of the configured RPC endpoints, under W-26a's and W-26b's rules.
// A small read-only JSON-RPC module: two calls per endpoint (`eth_chainId` and
// `eth_getBlockByNumber` at N, no transaction bodies), nothing sent but those
// calls, no credential, no storage. Fetch and the clock are injected.

import type { Hash32 } from "./hex.ts";

/** One configured endpoint: its provider's name and URL (`rpcEndpoints`). */
export type RpcEndpoint = {
  readonly provider: string;
  readonly url: string;
};

/** The configuration fields the read uses, for the round's entropy source. */
export type ChainReadConfig = {
  /** The source's `rpcEndpoints`. */
  readonly endpoints: readonly RpcEndpoint[];
  /** The source's pinned `entropyChainId`. */
  readonly entropyChainId: number;
  readonly minRpcQuorum: number;
  readonly environment: "production" | "preview" | "local";
};

/** The platform's timers, injected so a test owns the clock. */
export type ChainReadClock = {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

export type ChainReadDeps = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
};

/** W-43's request timeout, per call. */
export const RPC_TIMEOUT_MS = 15_000;

/** What one endpoint gave, recorded for the check's display. */
export type EndpointAnswer = {
  readonly provider: string;
  /** `undefined`: no answer within the timeout, or not a chain id. */
  readonly chainId: bigint | undefined;
  /** `undefined`: no answer within the timeout, or not block N. */
  readonly blockHash: Hash32 | undefined;
};

/**
 * Why the read failed, in W-26b's order: `config` (a configuration the Wrapper
 * would refuse at boot), `other-chain`, `too-few` answering, `no-chain-id`
 * (gave a block but no chain id), `no-block` (gave a chain id but no valid hash
 * for block N: it cannot be shown to agree), `hash-mismatch`.
 */
export type ChainReadFailure =
  | "config"
  | "other-chain"
  | "too-few"
  | "no-chain-id"
  | "no-block"
  | "hash-mismatch";

export type ChainRead =
  | {
      readonly ok: true;
      /** The hash every answering endpoint returned. */
      readonly blockHash: Hash32;
      /** W-26a's exception: the "chain check not independent" indicator. */
      readonly degraded: boolean;
      readonly answers: readonly EndpointAnswer[];
    }
  | {
      readonly ok: false;
      readonly reason: ChainReadFailure;
      readonly answers: readonly EndpointAnswer[];
    };

const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/iu;
const HASH = /^0x[0-9a-f]{64}$/iu;

type Json = unknown;

const isRecord = (value: Json): value is Readonly<Record<string, Json>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toQuantity = (value: bigint): string => `0x${value.toString(16)}`;

/** The error of a read the caller aborted: neither an answer nor a failure. */
const abortError = (): DOMException =>
  new DOMException("The chain read was aborted.", "AbortError");

/** Throws the `AbortError` when the caller's `signal` has aborted. */
export const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) throw abortError();
};

/**
 * One JSON-RPC call; `undefined` for any failure: it is no answer. The caller's
 * `signal` is different: when it aborts, the request ends and the call throws
 * an `AbortError`, never `undefined`, so an abort is not mistaken for a silent
 * endpoint. The per-call timeout stays "no answer".
 */
const call = async (
  deps: ChainReadDeps,
  url: string,
  method: string,
  params: readonly Json[],
  signal?: AbortSignal,
): Promise<Json> => {
  throwIfAborted(signal);
  const { fetch: doFetch, clock } = deps;
  // The timer and the caller's signal both end the request through this one.
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const handle = clock.setTimeout(() => {
    controller.abort();
  }, RPC_TIMEOUT_MS);
  let result: Json;
  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    const body: Json = response.ok ? await response.json() : undefined;
    result =
      isRecord(body) && body["error"] === undefined
        ? body["result"]
        : undefined;
  } catch {
    result = undefined;
  } finally {
    clock.clearTimeout(handle);
    signal?.removeEventListener("abort", onAbort);
  }
  throwIfAborted(signal);
  return result;
};

const readChainId = async (
  deps: ChainReadDeps,
  url: string,
  signal?: AbortSignal,
): Promise<bigint | undefined> => {
  const result = await call(deps, url, "eth_chainId", [], signal);
  return typeof result === "string" && QUANTITY.test(result)
    ? BigInt(result)
    : undefined;
};

/** The hash of block `blockNumber`; the block must be that block. */
const readBlockHash = async (
  deps: ChainReadDeps,
  url: string,
  blockNumber: bigint,
  signal?: AbortSignal,
): Promise<Hash32 | undefined> => {
  const result = await call(
    deps,
    url,
    "eth_getBlockByNumber",
    [toQuantity(blockNumber), false],
    signal,
  );
  if (!isRecord(result)) return undefined;
  const { hash, number } = result;
  if (typeof hash !== "string" || !HASH.test(hash)) return undefined;
  if (typeof number !== "string" || !QUANTITY.test(number)) return undefined;
  if (BigInt(number) !== blockNumber) return undefined;
  return hash.toLowerCase() as Hash32;
};

const askEndpoint = async (
  deps: ChainReadDeps,
  endpoint: RpcEndpoint,
  blockNumber: bigint,
  signal?: AbortSignal,
): Promise<EndpointAnswer> => {
  const [chainId, blockHash] = await Promise.all([
    readChainId(deps, endpoint.url, signal),
    readBlockHash(deps, endpoint.url, blockNumber, signal),
  ]);
  return { provider: endpoint.provider, chainId, blockHash };
};

/** W-26a's boot rule and W-26b's endpoint count, as the page sees them. */
const configIsRefused = (config: ChainReadConfig): boolean =>
  !Number.isSafeInteger(config.entropyChainId) ||
  config.entropyChainId < 0 ||
  !Number.isInteger(config.minRpcQuorum) ||
  config.minRpcQuorum < 1 ||
  (config.environment === "production" && config.minRpcQuorum < 2) ||
  config.endpoints.length < config.minRpcQuorum;

/**
 * Block `blockNumber`'s hash by a quorum read (V-12, check 6). Passes only if
 * no endpoint reports another chain id than the pinned one, at least
 * `minRpcQuorum` endpoints answered, every answering endpoint gave a chain id,
 * no endpoint that gave a chain id lacks the hash, and all returned the same
 * hash. The first failure in that order is the one returned; an outlier is
 * never dropped and no side is picked. When `signal` aborts, the requests in
 * flight end and the read rejects with an `AbortError`: an abort is not an
 * endpoint's answer, so it is never a failure of this read.
 */
export const readBlockHashByQuorum = async (
  deps: ChainReadDeps,
  config: ChainReadConfig,
  blockNumber: bigint,
  signal?: AbortSignal,
): Promise<ChainRead> => {
  throwIfAborted(signal);
  if (configIsRefused(config) || blockNumber < 0n) {
    return { ok: false, reason: "config", answers: [] };
  }
  const answers = await Promise.all(
    config.endpoints.map(endpoint =>
      askEndpoint(deps, endpoint, blockNumber, signal),
    ),
  );
  const fail = (reason: ChainReadFailure): ChainRead => ({
    ok: false,
    reason,
    answers,
  });
  const pinned = BigInt(config.entropyChainId);
  if (answers.some(a => a.chainId !== undefined && a.chainId !== pinned)) {
    return fail("other-chain");
  }
  const hashes = answers.flatMap(a => (a.blockHash === undefined ? [] : [a]));
  if (hashes.length < config.minRpcQuorum) return fail("too-few");
  if (hashes.some(a => a.chainId === undefined)) return fail("no-chain-id");
  if (answers.some(a => a.chainId !== undefined && a.blockHash === undefined)) {
    return fail("no-block");
  }
  const [first] = hashes;
  if (first?.blockHash === undefined) return fail("too-few");
  if (hashes.some(a => a.blockHash !== first.blockHash)) {
    return fail("hash-mismatch");
  }
  return {
    ok: true,
    blockHash: first.blockHash,
    degraded: config.minRpcQuorum === 1,
    answers,
  };
};

/**
 * The block value check 7 uses, and the comparison with the evidence's optional
 * `randomnessProof.blockValue` (V-12, check 6): when present it MUST equal the
 * hash the quorum agreed on; when absent the agreed hash is used.
 */
export type BlockValue = {
  readonly blockValue: Hash32;
  /** `absent`: the evidence carries none. */
  readonly evidence: "equal" | "different" | "absent";
};

export const resolveBlockValue = (
  agreed: Hash32,
  evidenceBlockValue?: string,
): BlockValue => ({
  blockValue: agreed,
  evidence:
    evidenceBlockValue === undefined
      ? "absent"
      : evidenceBlockValue.toLowerCase() === agreed
        ? "equal"
        : "different",
});
