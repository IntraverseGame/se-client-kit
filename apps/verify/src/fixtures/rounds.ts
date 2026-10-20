// Test-only: rounds built from the vendored Snapshot vectors (read through the
// `contracts` test-only entry), written as the verify API's `RoundVerification`
// body (`verifyBody`: the vectors hold the signed values, and no vendored
// vector is a verify API body) and parsed by the page's own verify API module
// so the tests see exactly the evidence the page would, a configuration pinned
// to a vector's values, and a fake JSON-RPC `fetch` for the chain read.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";

import type { ChainReadDeps } from "../chain-read.ts";
import type { VerifyConfig } from "../environment-config.ts";
import type { RoundEvidence } from "../round-evidence.ts";
import { createVerifyApi } from "../verify-api.ts";
import { asRecord, verifyBody } from "./verify-body.ts";

type Json = Record<string, unknown>;

const record = (value: unknown, where: string): Json => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: not an object`);
  }
  return value as Json;
};

/** A deep, mutable copy of a vector's Snapshot, for a test to change. */
const copy = (value: unknown): Json =>
  record(JSON.parse(JSON.stringify(value)), "copy");

export type Pinned = {
  readonly chainId: number;
  readonly verifyingContract: `0x${string}`;
  readonly signer: `0x${string}`;
};

export type SignatureVector = {
  readonly input: Json;
  readonly pinned: Pinned;
  readonly verdict: string;
  readonly reason: string | undefined;
};

/** A `signature/` vector by its file name, e.g. `create-round-auth-accept`. */
export const signatureVector = (name: string): SignatureVector => {
  const vector = record(snapshotVectors.signature[name], name);
  const pinned = record(vector["pinned"], `${name}.pinned`);
  const { reason } = vector;
  return {
    input: copy(vector["input"]),
    pinned: {
      chainId: pinned["chainId"] as number,
      verifyingContract: pinned["verifyingContract"] as `0x${string}`,
      signer: pinned["signer"] as `0x${string}`,
    },
    verdict: String(vector["verdict"]),
    reason: typeof reason === "string" ? reason : undefined,
  };
};

/** A `valid/` vector's Snapshot by its file name. */
export const validSnapshot = (name: string): Json =>
  copy(record(snapshotVectors.valid[name], name)["input"]);

/** The object at a dotted path of `root`, for a test to change in place. */
export const at = (root: Json, path: string): Json =>
  path
    .split(".")
    .reduce<Json>((node, key) => record(node[key], `${path}: ${key}`), root);

export const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";
export const SOURCE = "ethereum:block";
export const ENTROPY_CHAIN_ID = 1;
export const RPC_URLS = ["https://rpc-a.example/", "https://rpc-b.example/"];

/** A configuration pinned to `pinned`, with two endpoints for the source. */
export const configFor = (
  pinned: Pinned,
  overrides: Partial<VerifyConfig> = {},
): VerifyConfig => ({
  environment: "production",
  runtimeSigner: pinned.signer,
  registryDomain: {
    chainId: BigInt(pinned.chainId),
    verifyingContract: pinned.verifyingContract,
  },
  minRpcQuorum: 2,
  sources: {
    [SOURCE]: {
      chainId: ENTROPY_CHAIN_ID,
      endpoints: RPC_URLS.map((url, i) => ({ provider: `p${String(i)}`, url })),
    },
  },
  verifyBaseUrl: "https://wrapper.example/verify",
  verifyApiBaseUrl: "https://wrapper.example/verify/v1",
  ...overrides,
});

/** A clock whose timers never fire: every fake answers at once. */
const idleClock = {
  setTimeout: () => 0,
  clearTimeout: (): void => {
    // Nothing was scheduled.
  },
};

/** The page's verify API module's reading of a body. */
export const evidenceOfBody = async (body: unknown): Promise<RoundEvidence> => {
  const api = createVerifyApi({
    fetch: (() =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      )) as typeof fetch,
    clock: idleClock,
    baseUrl: "https://wrapper.example/verify/v1",
  });
  const result = await api.readRound(ROUND_ID);
  if (result.kind !== "found") {
    throw new TypeError(`the body does not validate: ${result.kind}`);
  }
  return result.evidence;
};

/** A Snapshot, written as the verify API's body and read as the page does. */
export const evidenceOf = (snapshot: unknown): Promise<RoundEvidence> =>
  evidenceOfBody(verifyBody(asRecord(snapshot)));

/** What one fake endpoint answers: a block hash, or nothing. */
export type EndpointReply = {
  readonly chainId?: number;
  readonly hash?: string | undefined;
};

/**
 * A fake JSON-RPC `fetch` keyed by URL: `eth_chainId` and
 * `eth_getBlockByNumber` for the block the request asks for.
 */
export const chainDeps = (
  replies: Readonly<Record<string, EndpointReply>>,
): ChainReadDeps => ({
  fetch: ((input: string | URL | Request, init?: RequestInit) => {
    const reply = replies[String(input)] ?? {};
    const body = record(JSON.parse(String(init?.body)), "rpc");
    const params = body["params"] as unknown[];
    const result =
      body["method"] === "eth_chainId"
        ? `0x${(reply.chainId ?? ENTROPY_CHAIN_ID).toString(16)}`
        : reply.hash === undefined
          ? null
          : { hash: reply.hash, number: params[0] };
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        status: 200,
      }),
    );
  }) as typeof fetch,
  clock: idleClock,
});
