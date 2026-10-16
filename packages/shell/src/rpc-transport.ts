// The RPC transport the Wrapper supplies to the tip check (W-26b), and the abort
// controller each call gets. The kit compiles without the DOM library, so the
// signal is play-client's structural `CancelSignal`: the platform `AbortSignal`
// satisfies it.

import type { CancelSignal } from "@intraverse/se-client-play-client";

import type { RpcEndpoint } from "./config-fields.ts";

/** `finalized`, or a block number as a JSON-RPC quantity (`0x`, no leading 0). */
export type BlockTag = "finalized" | `0x${string}`;

/**
 * The one call the tip check makes: Ethereum JSON-RPC `eth_getBlockByNumber`
 * with the block tag and `false` (no transaction bodies).
 */
export type RpcCall = {
  readonly method: "eth_getBlockByNumber";
  readonly params: readonly [BlockTag, false];
};

/**
 * Sends `call` to `endpoint` as a JSON-RPC 2.0 request and resolves with the
 * response's `result` (any value: the shell validates it), or rejects on a
 * network failure or a JSON-RPC `error`. The tip check times each call out
 * itself and then aborts `signal` (one per call; the platform `AbortSignal`),
 * so the transport can stop the request; it may ignore the signal, and a late
 * answer is ignored.
 */
export type RpcTransport = (
  endpoint: RpcEndpoint,
  call: RpcCall,
  signal?: CancelSignal,
) => Promise<unknown>;

/** The part of the platform `AbortController` the tip check uses. */
export type CallAbortController = {
  readonly signal: CancelSignal;
  readonly abort: () => void;
};

type GlobalWithAbort = {
  readonly AbortController?: new () => CallAbortController;
};

/** A platform `AbortController`, or `undefined` where there is none. */
export const platformAbortController = (): CallAbortController | undefined => {
  const { AbortController } = globalThis as GlobalWithAbort;
  return AbortController === undefined ? undefined : new AbortController();
};
