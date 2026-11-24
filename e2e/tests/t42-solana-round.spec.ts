import { auditAccessibility } from "./harness/accessibility.ts";
import type { SolanaBehavior } from "./harness/fake-solana-rpc.ts";
import { documentAnswer, toReady } from "./harness/round-play.ts";
import { expect, test } from "./harness/solana-round-play.ts";
import {
  scriptSolanaCancel,
  solanaToReady,
} from "./harness/solana-round-script.ts";
import { solanaRound } from "./harness/solana-round.ts";
import {
  alertPanel,
  launchAndStart,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const resolving = (): ReturnType<typeof documentAnswer> =>
  documentAnswer(solanaRound("produced-slot", "coinflip-resolving-cancel"));

const FAILURES: readonly (readonly [SolanaBehavior, string])[] = [
  ["other-cluster", TEXT.verificationFailed],
  ["lagging", TEXT.verificationFailed],
  ["error", TEXT.chainUnverified],
];

test.describe("T-42: a Solana config round", () => {
  test("two agreeing endpoints pass the tip check and the round is ready", async ({
    page,
    fakePlayApi,
    fakeSolanaRpc,
    fakeEvmRpc,
  }) => {
    await solanaToReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    expect(
      fakeSolanaRpc.calls().map(call => `${call.provider} ${call.method}`),
    ).toEqual(
      expect.arrayContaining([
        "s1 getGenesisHash",
        "s1 getSlot",
        "s2 getGenesisHash",
        "s2 getSlot",
      ]),
    );
    expect(fakeSolanaRpc.calls()).toHaveLength(4);
    const byMethod = (method: string): readonly unknown[] =>
      fakeSolanaRpc
        .calls()
        .filter(call => call.method === method)
        .map(call => call.params);
    expect(byMethod("getGenesisHash")).toEqual([[], []]);
    expect(byMethod("getSlot")).toEqual([
      [{ commitment: "finalized" }],
      [{ commitment: "finalized" }],
    ]);
    expect(fakeEvmRpc.calls()).toEqual([]);
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  for (const [behavior, shown] of FAILURES) {
    test(`a tip check failed by ${behavior} on one endpoint signs the required cancel`, async ({
      page,
      fakePlayApi,
      fakeSolanaRpc,
    }) => {
      fakeSolanaRpc.behave("s2", behavior);
      scriptSolanaCancel(fakePlayApi, [resolving()]);
      fakePlayApi.answerEvery("getSnapshot", resolving());
      await launchAndStart(page, fakePlayApi);
      await expect(alertPanel(page)).toContainText(shown, { timeout: 15_000 });
      expect(servedFor(fakePlayApi, "cancelRound")).toHaveLength(1);
      await expect(page.locator("iframe")).toHaveAttribute("inert", "");
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }
});

test.describe("T-42: a document with an evm and a solana source", () => {
  test.use({ solanaDocument: "evm-and-solana" });

  test("a Solana round asks only the Solana endpoints", async ({
    page,
    fakePlayApi,
    fakeSolanaRpc,
    fakeEvmRpc,
  }) => {
    await solanaToReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    expect(fakeSolanaRpc.calls()).toHaveLength(4);
    expect(fakeEvmRpc.calls()).toEqual([]);
  });

  test("an EVM round asks only the EVM endpoints", async ({
    page,
    fakePlayApi,
    fakeSolanaRpc,
    fakeEvmRpc,
  }) => {
    await toReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    expect([...new Set(fakeEvmRpc.calls().map(call => call.provider))]).toEqual(
      expect.arrayContaining(["p1", "p2"]),
    );
    expect(fakeSolanaRpc.calls()).toEqual([]);
  });
});
