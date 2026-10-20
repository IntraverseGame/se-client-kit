// The verify API port: the ONLY module that fetches or parses the verify API's
// response (specs/verify-page.md, V-9 to V-11, VT-3). The page reads a round
// through `VerifyApi.readRound` and never sees a response, a status, or a raw
// body; everything past this file works on the `RoundEvidence` type below.
//
// ASSUMPTION (TODO(verify API)): the verify API document is not published yet.
// This module is built to an ASSUMED shape and is the one file the document
// replaces. Assumed: `GET <verifyApiBaseUrl>/rounds/{roundId}` answers 200 with
// a JSON body that carries the Snapshot's field names (`roundId`, `status`,
// `closeReason`, `payout`, `config`, `proofs` with `randomnessProof`,
// `fairnessProof`, `createRoundAuth`, `record`) plus a top-level integer
// `kernelVersion` (absent: kernel version 1 is assumed, V-12a); 404 is "no
// such round"; any other status is an error. Any verdict field the API might
// add is ignored (the page recomputes).

import type { ChainReadClock } from "./chain-read.ts";
import type {
  RoundEvidence,
  RoundStatus,
  StepEvidence,
} from "./round-evidence.ts";
import {
  snapshotPattern,
  snapshotPropertyPattern,
} from "./snapshot-patterns.ts";

export type VerifyApiResult =
  | { readonly kind: "found"; readonly evidence: RoundEvidence }
  /** The API answered that it has no such round (V-9). */
  | { readonly kind: "not-found" }
  /** Another error status, or a body that does not validate (V-10). */
  | { readonly kind: "error" }
  /** No answer: offline, DNS, TLS, timeout, reset, a blocked request (V-11). */
  | { readonly kind: "unreachable" };

/** The port the page reads a round through. Never throws. */
export type VerifyApi = {
  readonly readRound: (roundId: string) => Promise<VerifyApiResult>;
};

export type VerifyApiOptions = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
  /** `verifyApiBaseUrl`, ending with `/verify/v1`. */
  readonly baseUrl: string;
};

/** The kernel version assumed when the body carries none (V-12a). */
export const ASSUMED_KERNEL_VERSION = 1;

/** W-43's request timeout (V-5). */
export const VERIFY_API_TIMEOUT_MS = 15_000;

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const PATTERNS = {
  roundId: snapshotPattern("RoundId"),
  bytes32: snapshotPattern("RoundIdBytes32"),
  hash: snapshotPattern("Hash32"),
  address: snapshotPattern("Address"),
  signature: snapshotPattern("Signature65"),
  uint128: snapshotPattern("Uint128"),
  uint256: snapshotPattern("Uint256"),
  baseUnits: snapshotPattern("BaseUnits"),
  unit: snapshotPattern("Unit"),
};
const SOURCE = snapshotPropertyPattern("RandomnessProof", "source");
const STATUSES: ReadonlySet<string> = new Set([
  "idle",
  "starting",
  "active",
  "resolving",
  "won",
  "lost",
  "canceled",
]);
const MAX_UINT32 = 4_294_967_295;
const MAX_UINT40 = 1_099_511_627_775;

// A reader returns the value, or `Bad` for a present value that is malformed;
// an optional field that is absent reads as `undefined`.
const Bad: unique symbol = Symbol("bad");
type Read<T> = T | typeof Bad;

const text = (v: unknown, pattern?: RegExp): Read<string> =>
  typeof v === "string" && (pattern === undefined || pattern.test(v)) ? v : Bad;
const int = (
  v: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Read<number> =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max
    ? v
    : Bad;
/** A decimal amount in base units, read as `bigint` (never a `number`). */
const amount = (v: unknown, pattern: RegExp): Read<bigint> => {
  const value = text(v, pattern);
  return value === Bad ? Bad : BigInt(value);
};
const optional = <T>(
  v: unknown,
  read: (v: unknown) => Read<T>,
): Read<T | undefined> => (v === undefined ? undefined : read(v));
const object = (v: unknown): Read<Json> => (isRecord(v) ? v : Bad);

/** Reads `fields` of `source` with their readers; `Bad` if any is. */
const shape = <T extends Record<string, (v: unknown) => unknown>>(
  source: Json,
  readers: T,
): { [K in keyof T]: Exclude<ReturnType<T[K]>, typeof Bad> } | typeof Bad => {
  const out: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(readers)) {
    const value = read(Object.hasOwn(source, key) ? source[key] : undefined);
    if (value === Bad) return Bad;
    if (value !== undefined) out[key] = value;
  }
  return out as { [K in keyof T]: Exclude<ReturnType<T[K]>, typeof Bad> };
};

const nested =
  <T>(read: (source: Json) => Read<T>): ((v: unknown) => Read<T>) =>
  v => {
    const source = object(v);
    return source === Bad ? Bad : read(source);
  };

const zkProof = nested(s =>
  shape(s, {
    status: v => (typeof v === "string" ? v : Bad),
    verifiedBy: v => optional(v, x => text(x)),
    proofLink: v => optional(v, x => text(x)),
  }),
);

const newRound = nested(s =>
  shape(s, {
    roundId: v => text(v, PATTERNS.bytes32),
    playerRef: v => text(v, PATTERNS.hash),
    currency: v => text(v, PATTERNS.unit),
    betAmount: v => amount(v, PATTERNS.uint128),
    gameId: v => int(v, 0, MAX_UINT32),
    gameVersion: v => int(v, 0, MAX_UINT32),
    circuitVersion: v => int(v, 0, MAX_UINT32),
    roundSecretHash: v => text(v, PATTERNS.hash),
    randomnessTarget: v => text(v, PATTERNS.hash),
    actionKey: v => text(v, PATTERNS.address),
    payoutTermsHash: v => text(v, PATTERNS.hash),
  }),
);

const createRoundAuth = nested(s =>
  shape(s, {
    newRound,
    entropyChainId: v => int(v, 1),
    prepareWindow: v => int(v, 0, MAX_UINT40),
    expiry: v => text(v, PATTERNS.uint256),
    domain: nested(d =>
      shape(d, {
        name: v => text(v),
        version: v => text(v),
        chainId: v => int(v, 1),
        verifyingContract: v => text(v, PATTERNS.address),
      }),
    ),
    signer: v => text(v, PATTERNS.address),
    signature: v => text(v, PATTERNS.signature),
  }),
);

const randomnessProof = nested(s => {
  const read = shape(s, {
    source: v => text(v, SOURCE),
    blockValue: v => optional(v, x => text(x, PATTERNS.hash)),
    blockExplorerUrl: v => optional(v, x => text(x)),
    roundSecretHash: v => text(v, PATTERNS.hash),
    roundSecret: v => optional(v, x => text(x, PATTERNS.hash)),
    zkProof: v => optional(v, zkProof),
  });
  const blockNumber = int(s["blockNumber"], 0);
  return read === Bad || blockNumber === Bad
    ? Bad
    : { ...read, blockNumber: BigInt(blockNumber) };
});

const fairnessProof = nested(s =>
  shape(s, {
    seedHash: v => text(v, PATTERNS.hash),
    readyHash: v => optional(v, x => text(x, PATTERNS.hash)),
    seed: v => optional(v, x => text(x, PATTERNS.hash)),
    zkProof: v => optional(v, zkProof),
  }),
);

const record = nested(s =>
  shape(s, {
    chainId: v => int(v, 1),
    txHash: v => text(v, PATTERNS.hash),
    explorerUrl: v => optional(v, x => text(x)),
  }),
);

const step = nested(s =>
  shape(s, {
    optionCount: v => int(v, 2),
    selectedIndex: v => optional(v, x => int(x, 0)),
    losingIndex: v => optional(v, x => int(x, 0)),
  }),
);

const payout = nested(s =>
  shape(s, {
    formatted: v =>
      typeof v === "string" && v.length > 0 && v.length <= 64 ? v : Bad,
    value: v => amount(v, PATTERNS.baseUnits),
    unit: v => text(v, PATTERNS.unit),
  }),
);

const readSteps = (config: unknown): Read<readonly StepEvidence[]> => {
  const source = object(config);
  const steps = source === Bad ? Bad : source["steps"];
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 256)
    return Bad;
  const read = (steps as readonly unknown[]).map(s => step(s));
  return read.some(s => s === Bad) ? Bad : (read as StepEvidence[]);
};

/** The body as evidence, or `undefined` when it does not validate. */
const parseEvidence = (body: unknown): RoundEvidence | undefined => {
  const source = object(body);
  if (source === Bad) return undefined;
  const top = shape(source, {
    roundId: v => text(v, PATTERNS.roundId),
    // V-12a: until the document names the field, an absent one is version 1.
    kernelVersion: v => (v === undefined ? ASSUMED_KERNEL_VERSION : int(v, 0)),
    status: v =>
      typeof v === "string" && STATUSES.has(v) ? (v as RoundStatus) : Bad,
    closeReason: v => optional(v, x => text(x)),
    payout: v => optional(v, payout),
  });
  const steps = readSteps(source["config"]);
  const proofs = object(source["proofs"]);
  if (top === Bad || steps === Bad || proofs === Bad) return undefined;
  const proof = shape(proofs, {
    randomnessProof,
    fairnessProof: v => optional(v, fairnessProof),
    createRoundAuth: v => optional(v, createRoundAuth),
    record: v => optional(v, record),
  });
  return proof === Bad ? undefined : { ...top, steps, ...proof };
};

/** A verify API read over an injected `fetch` and clock. */
export const createVerifyApi = (options: VerifyApiOptions): VerifyApi => ({
  readRound: async roundId => {
    const { fetch: request } = options;
    const controller = new AbortController();
    const timer = options.clock.setTimeout(() => {
      controller.abort();
    }, VERIFY_API_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        // Called unbound: a `fetch` taken off `window` must not get another `this`.
        response = await request(
          `${options.baseUrl}/rounds/${encodeURIComponent(roundId)}`,
          {
            method: "GET",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );
      } catch {
        return { kind: "unreachable" };
      }
      if (response.status === 404) return { kind: "not-found" };
      if (!response.ok) return { kind: "error" };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return controller.signal.aborted
          ? { kind: "unreachable" }
          : { kind: "error" };
      }
      const evidence = parseEvidence(body);
      return evidence === undefined
        ? { kind: "error" }
        : { kind: "found", evidence };
    } finally {
      options.clock.clearTimeout(timer);
    }
  },
});
