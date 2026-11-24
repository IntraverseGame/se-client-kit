import { expect, test } from "./harness/fixtures.ts";
import {
  type Exchange,
  relocated,
  solanaLedger,
  type SolanaLedger,
} from "./harness/solana-ledger.ts";

const slotRelative = (ledger: SolanaLedger, value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value).replaceAll(/\d{9,}/gu, digits =>
      (BigInt(digits) - ledger.slot).toString(),
    ),
  );

const parentSlotOf = (exchange: Exchange): unknown => {
  const { answer } = exchange;
  if (!("result" in answer)) return undefined;
  const { result } = answer;
  return typeof result === "object" && result !== null && "parentSlot" in result
    ? result.parentSlot
    : undefined;
};

const relocationShape = (
  ledger: SolanaLedger,
  exchanges: readonly Exchange[],
): unknown =>
  exchanges.map((exchange, index) =>
    slotRelative(ledger, {
      method: exchange.method,
      params: exchange.params,
      answer: index === 2 ? parentSlotOf(exchange) : exchange.answer,
    }),
  );

test.describe("the fake Solana RPC: a relocated read", () => {
  const produced = solanaLedger("produced-slot");

  for (const [moved, name] of [
    ["skip", "skipped-slot"],
    ["gap", "skipped-slot-ledger-gap"],
  ] as const) {
    test(`${moved} has the shape the ${name} vector records`, () => {
      const recorded = solanaLedger(name);
      expect(relocationShape(produced, relocated(produced, moved))).toEqual(
        relocationShape(recorded, recorded.exchanges.slice(1)),
      );
    });
  }
});
