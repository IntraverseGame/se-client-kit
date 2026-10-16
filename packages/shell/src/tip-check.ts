// The tip check (W-26b, with W-26a's quorum and degraded mode). The shell asks
// every configured endpoint of the round's entropy source for its final block,
// then asks each one that answered for the block at `h_low`. It passes only if
// at least `minRpcQuorum` answered, every one is within the source's lag margin
// of `h_top`, and all of them return one hash at `h_low`. It never drops an
// outlier and never picks a side: any disagreement fails the check.
//
// The network is an injected transport; this module builds the JSON-RPC calls
// and reads their results as untrusted data.

import {
  type Clock,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "@intraverse/se-client-play-client";
import type { Bytes32 } from "@intraverse/se-client-signing";

import type { ChainConfig } from "./chain-config.ts";
import type { RpcEndpoint } from "./config-fields.ts";
import { ShellError } from "./errors.ts";
import {
  type BlockTag,
  platformAbortController,
  type RpcCall,
  type RpcTransport,
} from "./rpc-transport.ts";

/** One endpoint's answers, kept with the record whether it agreed or not. */
export type EndpointAnswer = {
  readonly provider: string;
  /** Its final block, or `null` when it did not answer in time. */
  readonly finalBlock: bigint | null;
  /**
   * Its hash of the block at `h_low`, or `null` when it was not asked (it gave
   * no final block) or did not answer that call with the block at `h_low`.
   */
  readonly hashAtLow: Bytes32 | null;
};

/** Why a tip check failed. */
export type TipCheckFailure =
  /** The configuration lists no endpoints for the round's entropy source. */
  | "unknown-source"
  /** Fewer than `minRpcQuorum` endpoints gave a final block (W-26a). */
  | "too-few-answered"
  /** An answering endpoint is more than the lag margin behind `h_top`. */
  | "lagging"
  /** An answering endpoint gave no block hash at `h_low`. */
  | "hash-unavailable"
  /** The answering endpoints gave different hashes at `h_low`. */
  | "hash-mismatch";

/** What the tip check saw, kept with the round's record (W-26b, W-27). */
export type TipCheckRecord = {
  /** The Snapshot's `proofs.randomnessProof.source`. */
  readonly source: string;
  readonly passed: boolean;
  /** Set exactly when `passed` is `false`. */
  readonly failure?: TipCheckFailure;
  /** `degraded` when `minRpcQuorum` is 1 (local or preview only, W-26a). */
  readonly tipCheck: "independent" | "degraded";
  /** The observed tip `h_top`; `null` when no endpoint answered. */
  readonly tip: bigint | null;
  /** `h_low`; `null` when no endpoint answered. */
  readonly low: bigint | null;
  /** The source's lag margin the check used. */
  readonly tipLagMargin: bigint | null;
  /** Every configured endpoint, in configuration order. */
  readonly answers: readonly EndpointAnswer[];
};

export type TipCheckOptions = {
  readonly config: ChainConfig;
  /** The round's entropy source, as the Snapshot names it. */
  readonly source: string;
  readonly transport: RpcTransport;
  /** The timers of each call's timeout (W-43). */
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** Each call's timeout. The default is the Wrapper's 15 s (W-43). */
  readonly timeoutMs?: number;
};

const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;
const HASH = /^0x[0-9a-fA-F]{64}$/u;
// A block number fits a `uint64`; anything longer is not an answer.
const MAX_QUANTITY_LENGTH = 2 + 16;

const NO_ANSWER: unique symbol = Symbol("no answer");

type Block = { readonly number: bigint; readonly hash: Bytes32 };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

// Reads a block from an untrusted `result`; anything else is no answer.
const readBlock = (value: unknown): Block | undefined => {
  try {
    if (!isRecord(value)) {
      return undefined;
    }
    const number = value["number"];
    const hash = value["hash"];
    if (
      typeof number !== "string" ||
      number.length > MAX_QUANTITY_LENGTH ||
      !QUANTITY.test(number) ||
      typeof hash !== "string" ||
      !HASH.test(hash)
    ) {
      return undefined;
    }
    return { number: BigInt(number), hash: hash.toLowerCase() as Bytes32 };
  } catch {
    // A throwing getter or proxy trap is no answer.
    return undefined;
  }
};

const quantity = (value: bigint): `0x${string}` => `0x${value.toString(16)}`;

const getBlock = (tag: BlockTag): RpcCall =>
  Object.freeze({
    method: "eth_getBlockByNumber",
    params: Object.freeze([tag, false] as const),
  });

/**
 * One call with its timeout: the block, or `NO_ANSWER` on a rejection, a
 * timeout (which aborts the call's signal), or a result that is not a block.
 */
const ask = (
  options: TipCheckOptions,
  timeoutMs: number,
  endpoint: RpcEndpoint,
  call: RpcCall,
): Promise<Block | typeof NO_ANSWER> =>
  new Promise(resolve => {
    const controller = platformAbortController();
    const handle = options.clock.setTimeout(() => {
      resolve(NO_ANSWER);
      controller?.abort();
    }, timeoutMs);
    const settle = (block: Block | typeof NO_ANSWER): void => {
      options.clock.clearTimeout(handle);
      resolve(block);
    };
    const answer = async (): Promise<void> => {
      try {
        const result = await options.transport(
          endpoint,
          call,
          controller?.signal,
        );
        settle(readBlock(result) ?? NO_ANSWER);
      } catch {
        // A rejection, or a transport that throws at once: no answer.
        settle(NO_ANSWER);
      }
    };
    void answer();
  });

const maxOf = (values: readonly bigint[]): bigint =>
  values.reduce((a, b) => (b > a ? b : a));

const minOf = (values: readonly bigint[]): bigint =>
  values.reduce((a, b) => (b < a ? b : a));

const judge = (
  answers: readonly EndpointAnswer[],
  quorum: number,
  tip: bigint,
  margin: bigint,
): TipCheckFailure | undefined => {
  const answered = answers.filter(a => a.finalBlock !== null);
  if (answered.length < quorum) {
    return "too-few-answered";
  }
  if (answered.some(a => tip - (a.finalBlock ?? tip) > margin)) {
    return "lagging";
  }
  if (answered.some(a => a.hashAtLow === null)) {
    return "hash-unavailable";
  }
  return new Set(answered.map(a => a.hashAtLow)).size === 1
    ? undefined
    : "hash-mismatch";
};

const record = (fields: TipCheckRecord): TipCheckRecord =>
  Object.freeze({
    ...fields,
    answers: Object.freeze(fields.answers.map(a => Object.freeze({ ...a }))),
  });

/**
 * Runs the tip check for `source` against every endpoint the configuration
 * lists for it. Never rejects on an endpoint's failure: the record says what
 * each one answered and whether the check passed. Throws `invalid-input` for a
 * timeout that is not a positive duration.
 */
export const runTipCheck = async (
  options: TipCheckOptions,
): Promise<TipCheckRecord> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    throw new ShellError("invalid-input");
  }
  const { config, source } = options;
  const tipCheck = config.degraded ? "degraded" : "independent";
  const sourceConfig = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  if (sourceConfig === undefined) {
    return record({
      source,
      passed: false,
      failure: "unknown-source",
      tipCheck,
      tip: null,
      low: null,
      tipLagMargin: null,
      answers: [],
    });
  }
  const { endpoints, tipLagMargin } = sourceConfig;
  const finals = await Promise.all(
    endpoints.map(endpoint =>
      ask(options, timeoutMs, endpoint, getBlock("finalized")),
    ),
  );
  const heights = finals.flatMap(f => (f === NO_ANSWER ? [] : [f.number]));
  if (heights.length === 0) {
    return record({
      source,
      passed: false,
      failure: "too-few-answered",
      tipCheck,
      tip: null,
      low: null,
      tipLagMargin,
      answers: endpoints.map(e => ({
        provider: e.provider,
        finalBlock: null,
        hashAtLow: null,
      })),
    });
  }
  const tip = maxOf(heights);
  const low = minOf(heights);
  const atLow = await Promise.all(
    endpoints.map((endpoint, i) =>
      finals[i] === NO_ANSWER
        ? NO_ANSWER
        : ask(options, timeoutMs, endpoint, getBlock(quantity(low))),
    ),
  );
  const answers = endpoints.map((endpoint, i): EndpointAnswer => {
    const final = finals[i];
    const block = atLow[i];
    return {
      provider: endpoint.provider,
      finalBlock:
        final === undefined || final === NO_ANSWER ? null : final.number,
      hashAtLow:
        block === undefined || block === NO_ANSWER || block.number !== low
          ? null
          : block.hash,
    };
  });
  const failure = judge(answers, config.minRpcQuorum, tip, tipLagMargin);
  return record({
    source,
    passed: failure === undefined,
    ...(failure === undefined ? {} : { failure }),
    tipCheck,
    tip,
    low,
    tipLagMargin,
    answers,
  });
};
