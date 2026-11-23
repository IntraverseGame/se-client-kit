import {
  exchangesFor,
  MAINNET_GENESIS,
  solanaAnswer,
  type SolanaBehavior,
  TESTNET_GENESIS,
} from "./harness/fake-solana-rpc.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  findExchange,
  SOLANA_CASES,
  solanaLedger,
  type SolanaLedger,
} from "./harness/solana-ledger.ts";
import {
  solanaCancelCheck,
  solanaPins,
  solanaRound,
  solanaRoundFacts,
} from "./harness/solana-round.ts";
import { validVector } from "./harness/vectors.ts";

const MARGIN = 64n;

const OPTIONS = {
  commitment: "finalized",
  encoding: "json",
  maxSupportedTransactionVersion: 0,
  rewards: false,
  transactionDetails: "none",
};

const scene = (ledger: SolanaLedger): Parameters<typeof solanaAnswer>[3] => ({
  ledger,
  lagMargin: MARGIN,
});

const FINALIZED = [{ commitment: "finalized" }];

const ask = (
  behavior: SolanaBehavior,
  ledger: SolanaLedger,
  method: string,
  params: unknown,
): ReturnType<typeof solanaAnswer> =>
  solanaAnswer(
    behavior,
    method,
    params,
    scene(ledger),
    exchangesFor(behavior, ledger),
  );

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("not an object");
  }
  return Object.fromEntries(Object.entries(value));
};

const snapshotInputOf = (ledger: SolanaLedger): Record<string, unknown> => {
  if (ledger.snapshotVector === undefined) {
    throw new Error(`${ledger.name} has no Snapshot vector`);
  }
  return asRecord(validVector(ledger.snapshotVector, "Snapshot").input);
};

test.describe("the fake Solana RPC: the ledger of the vendored reads", () => {
  for (const name of SOLANA_CASES) {
    test(`${name}: slot, final slot, and the recorded exchanges`, () => {
      const ledger = solanaLedger(name);
      expect(ledger.finalizedSlot).toBeGreaterThan(ledger.slot);
      expect(ledger.exchanges.length).toBeGreaterThanOrEqual(2);
      expect(ledger.exchanges[0]?.method).toBe("getSlot");
    });
  }

  test("the read of a produced slot and its Snapshot vector name the same slot and value", () => {
    const ledger = solanaLedger("produced-slot");
    const randomness = asRecord(
      asRecord(snapshotInputOf(ledger)["proofs"])["randomnessProof"],
    );
    expect(BigInt(String(randomness["blockNumber"]))).toBe(ledger.slot);
    expect(randomness["blockValue"]).toBe(ledger.value);
    expect(solanaRoundFacts("produced-slot").blockNumber).toBe(ledger.slot);
  });

  test("the skipped slot's read and its Snapshot vector name the same slot and value", () => {
    const ledger = solanaLedger("skipped-slot");
    const randomness = asRecord(
      asRecord(snapshotInputOf(ledger)["proofs"])["randomnessProof"],
    );
    expect(BigInt(String(randomness["blockNumber"]))).toBe(ledger.slot);
    expect(randomness["blockValue"]).toBe(ledger.value);
  });

  test("the ledger gap case gives no value and no Snapshot", () => {
    const ledger = solanaLedger("skipped-slot-ledger-gap");
    expect(ledger.value).toBeUndefined();
    expect(ledger.snapshotVector).toBeUndefined();
  });

  test("an exchange is found by its method and parameters, whatever the key order", () => {
    const ledger = solanaLedger("produced-slot");
    const slot = Number(ledger.slot);
    const reordered = {
      transactionDetails: "none",
      rewards: false,
      maxSupportedTransactionVersion: 0,
      encoding: "json",
      commitment: "finalized",
    };
    expect(
      findExchange(ledger.exchanges, "getBlock", [slot, reordered]),
    ).toBeDefined();
    expect(
      findExchange(ledger.exchanges, "getBlock", [
        slot,
        { commitment: "finalized" },
      ]),
    ).toBeUndefined();
  });
});

test.describe("the fake Solana RPC: answers by behavior", () => {
  const produced = solanaLedger("produced-slot");
  const slot = Number(produced.slot);

  test("agree: the mainnet genesis hash, the final slot, and the recorded block", () => {
    expect(ask("agree", produced, "getGenesisHash", [])).toEqual({
      result: MAINNET_GENESIS,
    });
    expect(ask("agree", produced, "getSlot", FINALIZED)).toEqual({
      result: Number(produced.finalizedSlot),
    });
    const block = ask("agree", produced, "getBlock", [slot, OPTIONS]);
    expect(block).toHaveProperty("result.blockhash");
    expect(block).toHaveProperty("result.parentSlot", slot - 1);
  });

  test("other-cluster: another genesis hash, everything else as agree", () => {
    expect(ask("other-cluster", produced, "getGenesisHash", [])).toEqual({
      result: TESTNET_GENESIS,
    });
    expect(ask("other-cluster", produced, "getSlot", FINALIZED)).toEqual(
      ask("agree", produced, "getSlot", FINALIZED),
    );
  });

  test("lagging: a final slot one past the margin behind", () => {
    expect(ask("lagging", produced, "getSlot", FINALIZED)).toEqual({
      result: Number(produced.finalizedSlot - MARGIN - 1n),
    });
  });

  test("error: a JSON-RPC error for every call", () => {
    for (const [method, params] of [
      ["getGenesisHash", []],
      ["getSlot", FINALIZED],
      ["getBlock", [slot, OPTIONS]],
    ] as const) {
      expect(ask("error", produced, method, params)).toHaveProperty(
        "error.code",
      );
    }
  });

  test("error: a request that is no recorded exchange is still unexpected", () => {
    for (const [method, params] of [
      ["getBalance", []],
      ["getSlot", []],
      ["getGenesisHash", FINALIZED],
      ["getBlock", [slot + 1, OPTIONS]],
    ] as const) {
      expect(ask("error", produced, method, params)).toBeUndefined();
    }
  });

  test("pruned: -32001 for the block, the rest as agree", () => {
    expect(ask("pruned", produced, "getBlock", [slot, OPTIONS])).toEqual({
      error: {
        code: -32_001,
        message: "Block cleaned up, does not exist on node",
      },
    });
    expect(ask("pruned", produced, "getGenesisHash", [])).toEqual({
      result: MAINNET_GENESIS,
    });
  });

  test("skip: N is -32007, the next block follows N, and its parent is below N", () => {
    expect(ask("skip", produced, "getBlock", [slot, OPTIONS])).toHaveProperty(
      "error.code",
      -32_007,
    );
    expect(
      ask("skip", produced, "getBlocksWithLimit", [slot, 1, FINALIZED[0]]),
    ).toEqual({ result: [slot + 1] });
    expect(
      ask("skip", produced, "getBlock", [slot + 1, OPTIONS]),
    ).toHaveProperty("result.parentSlot", slot - 1);
  });

  test("gap: the next block listed is two later and its parent is not below N", () => {
    expect(
      ask("gap", produced, "getBlocksWithLimit", [slot, 1, FINALIZED[0]]),
    ).toEqual({ result: [slot + 2] });
    expect(
      ask("gap", produced, "getBlock", [slot + 2, OPTIONS]),
    ).toHaveProperty("result.parentSlot", slot + 1);
  });

  test("the skipped slots answer as recorded, -32007 and -32009 alike", () => {
    for (const [name, code, next] of [
      ["skipped-slot", -32_007, 1],
      ["skipped-slots-long-term-storage", -32_009, 3],
    ] as const) {
      const ledger = solanaLedger(name);
      const n = Number(ledger.slot);
      expect(ask("agree", ledger, "getBlock", [n, OPTIONS])).toHaveProperty(
        "error.code",
        code,
      );
      expect(
        ask("agree", ledger, "getBlocksWithLimit", [n, 1, FINALIZED[0]]),
      ).toEqual({ result: [n + next] });
    }
  });

  test("a call the fake does not know is not answered", () => {
    expect(
      ask("agree", produced, "getSlot", [{ commitment: "processed" }]),
    ).toBeUndefined();
    expect(ask("agree", produced, "getSlot", [])).toBeUndefined();
    expect(ask("agree", produced, "getGenesisHash", FINALIZED)).toBeUndefined();
    expect(
      ask("agree", produced, "getBlock", [slot, { commitment: "finalized" }]),
    ).toBeUndefined();
    expect(
      ask("agree", produced, "getBlock", [slot + 7, OPTIONS]),
    ).toBeUndefined();
    expect(ask("agree", produced, "getBalance", [])).toBeUndefined();
    expect(ask("agree", produced, "eth_chainId", [])).toBeUndefined();
  });

  test("skip and gap need a produced slot", () => {
    expect(() =>
      ask("skip", solanaLedger("skipped-slot"), "getBlock", [slot, OPTIONS]),
    ).toThrow(/no block to move/u);
  });
});

test.describe("the Solana round the harness lays out of the vendored vectors", () => {
  test("keeps the vector's own createRoundAuth, roundId and slot over an active round", () => {
    const issued = validVector("coinflip-won-solana", "Snapshot").input;
    const round = solanaRound("produced-slot", "coinflip-active-ready-hash");
    expect(round["status"]).toBe("active");
    expect(round["roundId"]).toBe(issued["roundId"]);
    const proofs = asRecord(round["proofs"]);
    expect(proofs["createRoundAuth"]).toEqual(
      asRecord(issued["proofs"])["createRoundAuth"],
    );
    expect(asRecord(proofs["randomnessProof"])).toMatchObject({
      source: "solana",
      blockNumber: Number(solanaRoundFacts("produced-slot").blockNumber),
    });
    expect(asRecord(proofs["randomnessProof"])).not.toHaveProperty(
      "blockValue",
    );
  });

  test("pins the vector's signer and domain, source solana, cluster 101", () => {
    expect(solanaPins()).toMatchObject({
      source: "solana",
      entropyChainId: 101,
    });
  });

  test("the cancel check wants the cancel of this round, linked to its T_0", () => {
    const facts = solanaRoundFacts("produced-slot");
    const check = solanaCancelCheck("produced-slot");
    const typedData = Buffer.from(
      `0803120663616e63656c20012a20${facts.readyHash.slice(2)}`,
      "hex",
    ).toString("base64");
    const body = {
      idempotencyKey: "0192e4b0-0000-7000-8000-000000000001",
      roundId: facts.roundId,
      typedData,
      signature: `0x${"12".repeat(65)}`,
    };
    expect(check(body)).toBeUndefined();
    expect(
      check({ ...body, roundId: "01927c5e-8b3a-7f21-9c4d-000000000001" }),
    ).toBeDefined();
    expect(check({ ...body, signature: "0x1234" })).toBeDefined();
    expect(check({ ...body, typedData: "CAMSBmNhbmNlbCAB" })).toBeDefined();
  });
});
