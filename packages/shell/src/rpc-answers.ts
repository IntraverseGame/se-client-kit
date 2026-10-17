// The tip check's readers of untrusted JSON-RPC results (W-26b): a chain id
// and a block. Anything that is not exactly one is no answer.

import type { Bytes32 } from "@intraverse/se-client-signing";

const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;
const HASH = /^0x[0-9a-fA-F]{64}$/u;
// A block number fits a `uint64`; anything longer is not an answer.
const MAX_QUANTITY_LENGTH = 2 + 16;

export type Block = { readonly number: bigint; readonly hash: Bytes32 };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isQuantity = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_QUANTITY_LENGTH &&
  QUANTITY.test(value);

// Reads a chain id from an untrusted `result`: a canonical quantity of at most
// 64 bits. Anything else is no answer.
export const readChainId = (value: unknown): bigint | undefined =>
  isQuantity(value) ? BigInt(value) : undefined;

// Reads a block from an untrusted `result`; anything else is no answer.
export const readBlock = (value: unknown): Block | undefined => {
  try {
    if (!isRecord(value)) {
      return undefined;
    }
    const number = value["number"];
    const hash = value["hash"];
    if (!isQuantity(number) || typeof hash !== "string" || !HASH.test(hash)) {
      return undefined;
    }
    return { number: BigInt(number), hash: hash.toLowerCase() as Bytes32 };
  } catch {
    // A throwing getter or proxy trap is no answer.
    return undefined;
  }
};

/**
 * Whether an endpoint reported another chain id than the source's. Such an
 * endpoint fails the tip check whether or not it gave a final block: it is not
 * an endpoint of the source (W-26b).
 */
export const onAnotherChain = (
  answers: readonly { readonly chainId: bigint | null }[],
  chainId: bigint,
): boolean => answers.some(a => a.chainId !== null && a.chainId !== chainId);
