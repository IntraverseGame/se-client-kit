// A registry domain and the signer that signs under it, as one pair (V-3b): the
// current pair and the earlier ones of the configuration document, how a document's
// `earlierPins` is read, and which pair a round's answer selects for check 3. The
// answer only selects among the pairs the document holds; it never adds one.

import type { Detail } from "./check-result.ts";
import {
  hasExactly,
  isCount,
  isRecord,
  own,
  readAddress,
} from "./config-fields.ts";
import { MESSAGES as M } from "./messages.ts";
import type { CreateRoundAuthEvidence } from "./round-evidence.ts";

export type PinPair = {
  /** The address that signs `CreateRoundAuth` (lowercase). */
  readonly runtimeSigner: `0x${string}`;
  readonly registryDomain: {
    readonly chainId: bigint;
    readonly verifyingContract: `0x${string}`;
  };
};

export const readDomain = (
  value: unknown,
): PinPair["registryDomain"] | undefined => {
  if (!isRecord(value)) return undefined;
  const chainId = own(value, "chainId");
  const verifyingContract = readAddress(own(value, "verifyingContract"));
  return isCount(chainId, 1) && verifyingContract !== undefined
    ? Object.freeze({ chainId: BigInt(chainId), verifyingContract })
    : undefined;
};

/** One `earlierPins` entry: exactly a domain and a signer, each valid. */
const readPair = (value: unknown): PinPair | undefined => {
  if (
    !isRecord(value) ||
    !hasExactly(value, ["registryDomain", "runtimeSigner"])
  ) {
    return undefined;
  }
  const domain = own(value, "registryDomain");
  if (
    !isRecord(domain) ||
    !hasExactly(domain, ["chainId", "verifyingContract"])
  ) {
    return undefined;
  }
  const registryDomain = readDomain(domain);
  const runtimeSigner = readAddress(own(value, "runtimeSigner"));
  return registryDomain !== undefined && runtimeSigner !== undefined
    ? Object.freeze({ registryDomain, runtimeSigner })
    : undefined;
};

const pairKey = ({ registryDomain, runtimeSigner }: PinPair): string =>
  [
    registryDomain.chainId.toString(),
    registryDomain.verifyingContract,
    runtimeSigner,
  ].join(" ");

/**
 * `earlierPins`: absent is an empty list. Each entry is a pair, and none is the
 * current pair or repeats another. `refused` names the field, or an entry by
 * its index, never a value.
 */
export const readEarlierPins = (
  value: unknown,
  current: PinPair | undefined,
): {
  readonly pairs: readonly PinPair[];
  readonly refused: readonly string[];
} => {
  if (value === undefined) return { pairs: Object.freeze([]), refused: [] };
  if (!Array.isArray(value)) {
    return { pairs: Object.freeze([]), refused: ["earlierPins"] };
  }
  const seen = new Set(current === undefined ? [] : [pairKey(current)]);
  const pairs: PinPair[] = [];
  const refused: string[] = [];
  for (const [index, entry] of (value as readonly unknown[]).entries()) {
    const pair = readPair(entry);
    if (pair === undefined || seen.has(pairKey(pair))) {
      refused.push(`earlierPins.${String(index)}`);
    } else {
      seen.add(pairKey(pair));
      pairs.push(pair);
    }
  }
  return { pairs: Object.freeze(pairs), refused };
};

/** Whether the round's domain and signer, together, are the pair `pins`. */
const namesPair = (auth: CreateRoundAuthEvidence, pins: PinPair): boolean =>
  String(auth.domain.chainId) === pins.registryDomain.chainId.toString() &&
  auth.domain.verifyingContract.toLowerCase() ===
    pins.registryDomain.verifyingContract &&
  auth.signer.toLowerCase() === pins.runtimeSigner;

/** The earlier pair the round names, unless it names the current pair. */
export const earlierPairOf = (
  auth: CreateRoundAuthEvidence,
  config: PinPair & { readonly earlierPins: readonly PinPair[] },
): PinPair | undefined =>
  namesPair(auth, config)
    ? undefined
    : config.earlierPins.find(pair => namesPair(auth, pair));

/** What check 3 names of an earlier pair: its chain id, address, and signer. */
export const earlierDetails = (pair: PinPair): readonly Detail[] => [
  {
    label: M["check.earlierChainId"],
    value: pair.registryDomain.chainId.toString(),
  },
  {
    label: M["check.earlierContract"],
    value: pair.registryDomain.verifyingContract,
  },
  { label: M["check.earlierSigner"], value: pair.runtimeSigner },
];
