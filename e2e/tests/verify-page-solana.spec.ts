import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import { solanaLedger } from "./harness/solana-ledger.ts";
import { BOOK_ROUND_ID, bookRound } from "./harness/verify-book-rounds.ts";
import {
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import {
  expect,
  SOLANA_ROUND_ID,
  solanaBookRound,
  test,
} from "./harness/verify-solana-page.ts";

const TEXT = {
  bookDraw: "This round's draw was not recomputed",
  chainUnverified: "This round could not be verified against the chain",
  mismatch: "This round does not match its evidence",
} as const;

const CHECK = {
  1: "1. Round id",
  5: "5. Commitment and reveal",
  6: "6. Block N",
  7: "7. Seed",
} as const;

const heading = (page: Page, name: string): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 1, name });

const checkHeading = (
  page: Page,
  title: string,
): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 3, name: `${title}:` });

const slotOf = (name: Parameters<typeof solanaLedger>[0]): string =>
  solanaLedger(name).slot.toString();

const asked = (
  calls: readonly { readonly provider: string; readonly method: string }[],
): readonly string[] =>
  calls.map(call => `${call.provider} ${call.method}`).toSorted();

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

const expectMatchedBookRound = async (page: Page): Promise<void> => {
  await expect(heading(page, TEXT.bookDraw)).toBeVisible();
  await Promise.all(
    ([1, 5, 6, 7] as const).map(id =>
      expect(checkHeading(page, CHECK[id])).toContainText("matches"),
    ),
  );
};

test.describe("VT-15: the verify page against the fake Solana RPC", () => {
  test("a produced slot's book round reaches V-8's book reason", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
    solanaRpc,
    verifyRpc,
  }) => {
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-won", "produced-slot"),
    });
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expectMatchedBookRound(page);
    expect(asked(solanaRpc.calls())).toEqual([
      "s1 getBlock",
      "s1 getGenesisHash",
      "s2 getBlock",
      "s2 getGenesisHash",
    ]);
    expect(verifyRpc.calls()).toEqual([]);
    await expect(page.getByText("this cluster").first()).toBeVisible();
  });

  test("the book reason passes the accessibility audit", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
  }) => {
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-lost", "produced-slot"),
    });
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expect(heading(page, TEXT.bookDraw)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test.describe("N skipped (-32007)", () => {
    test.use({ solanaCase: "skipped-slot" });

    test("the value is the next block's, and the page says so", async ({
      page,
      fakeVerifyApi,
      solanaVerifyPage,
      solanaRpc,
    }) => {
      fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
        kind: "round",
        body: solanaBookRound("book-lifecycle-won", "skipped-slot"),
      });
      await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
      await expectMatchedBookRound(page);
      expect(asked(solanaRpc.calls())).toEqual([
        "s1 getBlock",
        "s1 getBlock",
        "s1 getBlocksWithLimit",
        "s1 getGenesisHash",
        "s2 getBlock",
        "s2 getBlock",
        "s2 getBlocksWithLimit",
        "s2 getGenesisHash",
      ]);
      await expect(
        page
          .getByText(
            `slot ${slotOf("skipped-slot")} was skipped; the value is the block at slot ${(solanaLedger("skipped-slot").slot + 1n).toString()}`,
          )
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("three slots skipped, from long-term storage (-32009)", () => {
    test.use({ solanaCase: "skipped-slots-long-term-storage" });

    test("the value is the first block after all three", async ({
      page,
      fakeVerifyApi,
      solanaVerifyPage,
    }) => {
      fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
        kind: "round",
        body: solanaBookRound(
          "book-lifecycle-won",
          "skipped-slots-long-term-storage",
        ),
      });
      await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
      await expectMatchedBookRound(page);
      await expect(
        page
          .getByText(
            `slot ${slotOf("skipped-slots-long-term-storage")} was skipped; the value is the block at slot ${(solanaLedger("skipped-slots-long-term-storage").slot + 3n).toString()}`,
          )
          .first(),
      ).toBeVisible();
    });
  });

  test("an endpoint answering -32001 makes check 6 could not be verified, with the pruned detail", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
    solanaRpc,
  }) => {
    solanaRpc.behave("s2", "pruned");
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-won", "produced-slot"),
    });
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expect(heading(page, TEXT.chainUnverified)).toBeVisible();
    await expect(checkHeading(page, CHECK[6])).toContainText(
      "could not be verified",
    );
    await expect(
      page
        .getByText(
          `this provider does not serve slot ${slotOf("produced-slot")}`,
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Check again" }),
    ).toBeVisible();
  });

  test("an endpoint of another cluster makes check 6 could not be verified", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
    solanaRpc,
  }) => {
    solanaRpc.behave("s2", "other-cluster");
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-won", "produced-slot"),
    });
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expect(heading(page, TEXT.chainUnverified)).toBeVisible();
    await expect(page.getByText("another cluster").first()).toBeVisible();
  });

  test("a ledger gap on one endpoint is shown, never hidden behind the quorum", async ({
    page,
    fakeVerifyApi,
    solanaVerifyPage,
    solanaRpc,
  }) => {
    solanaRpc.behave("s1", "gap");
    fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
      kind: "round",
      body: solanaBookRound("book-lifecycle-won", "produced-slot"),
    });
    await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
    await expect(heading(page, TEXT.chainUnverified)).toBeVisible();
    await expect(
      page.getByText(`its ledger has a gap at slot ${slotOf("produced-slot")}`),
    ).toBeVisible();
  });

  test.describe("a document with an evm and a solana source", () => {
    test.use({ solanaDocument: "evm-and-solana", verifyRounds: "book" });

    test("a round of each source verifies against its own endpoints", async ({
      page,
      fakeVerifyApi,
      solanaVerifyPage,
      solanaRpc,
      verifyRpc,
    }) => {
      fakeVerifyApi.answerEvery(BOOK_ROUND_ID, {
        kind: "round",
        body: bookRound("book-lifecycle-won"),
      });
      fakeVerifyApi.answerEvery(SOLANA_ROUND_ID, {
        kind: "round",
        body: solanaBookRound("book-lifecycle-won", "produced-slot"),
      });
      await solanaVerifyPage.open(page, BOOK_ROUND_ID);
      await expectMatchedBookRound(page);
      expect(solanaRpc.calls()).toEqual([]);
      expect(asked(verifyRpc.calls())).toEqual([
        "p1 eth_chainId",
        "p1 eth_getBlockByNumber",
        "p2 eth_chainId",
        "p2 eth_getBlockByNumber",
      ]);
      const evmCalls = verifyRpc.calls().length;
      await solanaVerifyPage.open(page, SOLANA_ROUND_ID);
      await expectMatchedBookRound(page);
      expect(verifyRpc.calls()).toHaveLength(evmCalls);
      expect(asked(solanaRpc.calls())).toEqual([
        "s1 getBlock",
        "s1 getGenesisHash",
        "s2 getBlock",
        "s2 getGenesisHash",
      ]);
    });
  });
});
