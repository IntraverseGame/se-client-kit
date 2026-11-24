import { describe, expect, it } from "vitest";

import { readSolanaValueByQuorum } from "./chain-read-solana.ts";
import { type EntropyCase, entropyRead } from "./fixtures/entropy-vectors.ts";
import { endpoints, SOL_A, solanaConfig } from "./fixtures/solana-read.ts";
import { solanaFake } from "./fixtures/solana-rpc.ts";

const run = async (name: EntropyCase) => {
  const vector = entropyRead(name);
  const fake = solanaFake(endpoints(vector.script));
  const result = await readSolanaValueByQuorum(
    fake.deps,
    solanaConfig(),
    vector.slot,
  );
  return { vector, fake, result };
};

describe("the entropy/v1/solana reads replay through the Solana chain read", () => {
  it("produced-slot: both endpoints agree on the vector's value, with no skipped slot", async () => {
    const { vector, fake, result } = await run("produced-slot");
    expect(fake.unexpected).toEqual([]);
    expect(result).toMatchObject({ ok: true, blockHash: vector.value });
    expect(result.answers).toHaveLength(2);
    for (const answer of result.answers) {
      expect(answer).toMatchObject({
        genesis: "pinned",
        blockHash: vector.value,
        fromSlot: undefined,
      });
    }
  });

  it.each(["skipped-slot", "skipped-slots-long-term-storage"] as const)(
    "%s: both endpoints agree on the value of the block after the skipped slots",
    async name => {
      const { vector, fake, result } = await run(name);
      expect(fake.unexpected).toEqual([]);
      expect(vector.valueSlot).toBeGreaterThan(vector.slot);
      expect(result).toMatchObject({ ok: true, blockHash: vector.value });
      expect(result.answers).toHaveLength(2);
      for (const answer of result.answers) {
        expect(answer).toMatchObject({
          genesis: "pinned",
          blockHash: vector.value,
          fromSlot: vector.valueSlot,
        });
      }
    },
  );

  it.each([
    "produced-slot",
    "skipped-slot",
    "skipped-slots-long-term-storage",
    "skipped-slot-ledger-gap",
  ] as const)(
    "%s: asks exactly the calls the vector records, in order",
    async name => {
      const { vector, fake } = await run(name);
      const asked = fake.requests
        .filter(request => request.url === SOL_A)
        .filter(request => request.method !== "getGenesisHash")
        .map(({ method, params }) => ({ method, params }));
      expect(asked).toEqual(vector.calls);
    },
  );

  it("skipped-slot-ledger-gap: the read is refused and no value is served", async () => {
    const { vector, result } = await run("skipped-slot-ledger-gap");
    expect(vector.refusal).toBe("ledger-gap");
    expect(vector.value).toBeUndefined();
    expect(result).toMatchObject({ ok: false, reason: "ledger-gap" });
    for (const answer of result.answers) {
      expect(answer).toMatchObject({
        blockHash: undefined,
        missing: "ledger-gap",
      });
    }
  });
});
