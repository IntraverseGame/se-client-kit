// VT-3: the verify API read and the body's validation (V-9 to V-11). The body
// is the ASSUMED shape (TODO(verify API)): a vendored Snapshot vector's fields
// plus an optional `kernelVersion`. A body the validator refuses is an API
// error, never a partial result; amounts read as `bigint`.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import { describe, expect, it } from "vitest";

import { httpFake, type Reply } from "./fixtures/http-fake.ts";
import {
  ASSUMED_KERNEL_VERSION,
  createVerifyApi,
  VERIFY_API_TIMEOUT_MS,
  type VerifyApiResult,
} from "./verify-api.ts";

type Json = Record<string, unknown>;

const BASE = "https://se.example/verify/v1";
const ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

const inputOf = (name: string): Json => {
  const vector = snapshotVectors.valid[name] as { input: Json } | undefined;
  if (vector === undefined) throw new TypeError(`no vector ${name}`);
  return structuredClone(vector.input);
};

/** A won Coin Flip round with its proofs and a payout, as the assumed body. */
const body = (): Json => ({
  ...inputOf("coinflip-won-proofs-verified"),
  payout: inputOf("coinflip-won-payout")["payout"],
});

const read = async (
  reply: Reply,
  unbound = false,
): Promise<{ result: VerifyApiResult; fake: ReturnType<typeof httpFake> }> => {
  const fake = httpFake(reply, unbound);
  const api = createVerifyApi({
    fetch: fake.fetch,
    clock: fake.clock,
    baseUrl: BASE,
  });
  return { result: await api.readRound(ID), fake };
};

const evidenceOf = (result: VerifyApiResult) => {
  if (result.kind !== "found") throw new TypeError(`not found: ${result.kind}`);
  return result.evidence;
};

/** The object at the parent of `path` (dotted) in `copy`, and the last key. */
const parentOf = (copy: Json, path: string): [Json, string] => {
  const keys = path.split(".");
  let target: Json = copy;
  for (const key of keys.slice(0, -1)) target = target[key] as Json;
  return [target, keys.at(-1) ?? ""];
};

/** A copy of the body with `path` set to `value`. */
const withField = (path: string, value: unknown): Json => {
  const copy = body();
  const [target, last] = parentOf(copy, path);
  target[last] = value;
  return copy;
};

/** A copy of the body without `path`. */
const withoutField = (path: string): Json => {
  const copy = body();
  const [target, last] = parentOf(copy, path);
  Reflect.deleteProperty(target, last);
  return copy;
};

describe("the request", () => {
  it("asks <verifyApiBaseUrl>/rounds/{roundId}, without credentials", async () => {
    const { fake } = await read({ kind: "json", body: body() });
    expect(fake.requests).toHaveLength(1);
    const [request] = fake.requests;
    expect(request?.url).toBe(`${BASE}/rounds/${ID}`);
    expect(request?.init.method).toBe("GET");
    expect(request?.init.credentials).toBe("omit");
    expect(request?.init.cache).toBe("no-store");
    expect(request?.init.redirect).toBe("error");
  });

  // The browser's `fetch` throws "Illegal invocation" when it is called with
  // another `this`; `createVerifyApi` must call it unbound, as `chain-read.ts`
  // does.
  it("calls fetch unbound (the fake throws otherwise)", async () => {
    const { result } = await read({ kind: "json", body: body() }, true);
    expect(result.kind).toBe("found");
  });

  it("sets one 15 s timer and clears it", async () => {
    const { fake } = await read({ kind: "json", body: body() });
    expect(fake.delays).toEqual([VERIFY_API_TIMEOUT_MS]);
    expect(VERIFY_API_TIMEOUT_MS).toBe(15_000);
    expect(fake.pending()).toBe(0);
  });
});

describe("a round found", () => {
  it("reads the evidence by the Snapshot's names", async () => {
    const evidence = evidenceOf(
      (await read({ kind: "json", body: body() })).result,
    );
    expect(evidence.roundId).toBe(ID);
    expect(evidence.status).toBe("won");
    expect(evidence.steps).toEqual([
      { optionCount: 2, selectedIndex: 1, losingIndex: 0 },
    ]);
    expect(evidence.randomnessProof.source).toBe("ethereum:block");
    expect(evidence.fairnessProof?.seed).toBe(`0x${"55".repeat(32)}`);
    expect(evidence.createRoundAuth?.signer).toBe(
      "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    );
    expect(evidence.record?.txHash).toBe(`0x${"99".repeat(32)}`);
    expect(evidence.randomnessProof.zkProof?.proofLink).toBe(
      `https://explorer.example.com/tx/0x${"88".repeat(32)}`,
    );
  });

  it("reads amounts and the block number as bigint, never a number", async () => {
    const evidence = evidenceOf(
      (await read({ kind: "json", body: body() })).result,
    );
    expect(evidence.createRoundAuth?.newRound.betAmount).toBe(100n);
    expect(evidence.payout?.value).toBe(194n);
    expect(evidence.payout?.formatted).toBe("€1.94");
    expect(evidence.randomnessProof.blockNumber).toBe(21_000_123n);
  });

  it("assumes kernel version 1 when the body carries none (V-12a)", async () => {
    expect(ASSUMED_KERNEL_VERSION).toBe(1);
    const evidence = evidenceOf(
      (await read({ kind: "json", body: body() })).result,
    );
    expect(evidence.kernelVersion).toBe(1);
  });

  it("keeps another kernel version as given", async () => {
    const evidence = evidenceOf(
      (await read({ kind: "json", body: { ...body(), kernelVersion: 7 } }))
        .result,
    );
    expect(evidence.kernelVersion).toBe(7);
  });

  it("ignores a verdict field the API might add", async () => {
    const evidence = evidenceOf(
      (await read({ kind: "json", body: { ...body(), verified: true } }))
        .result,
    );
    expect(evidence).not.toHaveProperty("verified");
  });
});

describe("statuses", () => {
  it("reads 404 as not found (V-9)", async () => {
    const { result } = await read({ kind: "json", status: 404, body: {} });
    expect(result).toEqual({ kind: "not-found" });
  });

  it.each([400, 403, 500, 503])(
    "reads %i as an API error (V-10)",
    async status => {
      const { result } = await read({ kind: "json", status, body: body() });
      expect(result).toEqual({ kind: "error" });
    },
  );

  it("reads a body that is not JSON as an API error", async () => {
    const { result } = await read({ kind: "text", body: "<html>" });
    expect(result).toEqual({ kind: "error" });
  });

  it("reads a rejected fetch as unreachable (V-11)", async () => {
    const { result, fake } = await read({ kind: "reject" });
    expect(result).toEqual({ kind: "unreachable" });
    expect(fake.pending()).toBe(0);
  });

  it("reads a timeout as unreachable (V-11)", async () => {
    const { result, fake } = await read({ kind: "hang" });
    expect(result).toEqual({ kind: "unreachable" });
    expect(fake.pending()).toBe(0);
  });
});

describe("a body that does not validate is an API error, never partly used", () => {
  const hash = `0x${"ab".repeat(32)}`;
  it.each<[string, Json]>([
    ["not an object", [] as unknown as Json],
    [
      "a round id that is not canonical",
      withField("roundId", ID.toUpperCase()),
    ],
    ["an unknown status", withField("status", "paid")],
    ["a fractional kernel version", withField("kernelVersion", 1.5)],
    ["a negative kernel version", withField("kernelVersion", -1)],
    ["a kernel version as text", withField("kernelVersion", "1")],
    ["no randomnessProof", withoutField("proofs.randomnessProof")],
    ["no proofs", withoutField("proofs")],
    [
      "a hash in upper case",
      withField(
        "proofs.randomnessProof.roundSecretHash",
        hash.toUpperCase().replace("0X", "0x"),
      ),
    ],
    ["a short hash", withField("proofs.fairnessProof.seed", "0xabcd")],
    [
      "a block number as text",
      withField("proofs.randomnessProof.blockNumber", "21000123"),
    ],
    [
      "an unsafe block number",
      withField("proofs.randomnessProof.blockNumber", 2 ** 53),
    ],
    [
      "a bet amount as a number",
      withField("proofs.createRoundAuth.newRound.betAmount", 100),
    ],
    ["a payout value as a number", withField("payout.value", 194)],
    ["a payout value with a sign", withField("payout.value", "-194")],
    ["an empty formatted payout", withField("payout.formatted", "")],
    [
      "a malformed signature",
      withField("proofs.createRoundAuth.signature", "0x00"),
    ],
    [
      "a signature with a bad v",
      withField("proofs.createRoundAuth.signature", `0x${"ab".repeat(64)}1d`),
    ],
    [
      "a malformed signer",
      withField("proofs.createRoundAuth.signer", "0x3c44"),
    ],
    ["empty steps", withField("config.steps", [])],
    ["no config", withoutField("config")],
    ["a step with one option", withField("config.steps", [{ optionCount: 1 }])],
    [
      "a negative pick",
      withField("config.steps", [{ optionCount: 2, selectedIndex: -1 }]),
    ],
    ["a zkProof without status", withField("proofs.fairnessProof.zkProof", {})],
  ])("%s", async (_, json) => {
    const { result } = await read({ kind: "json", body: json });
    expect(result).toEqual({ kind: "error" });
  });
});
