// VT-5 (specs/verify-page.md), the rows for rounds the backend recorded: a
// `won` and a `lost` Coin Flip round with their reveals, served by the e2e fake
// of the verify API, so the page recomputes checks 5 and 7 (the payout
// included) and they match, and a tampered copy of each names the check that
// fails. The configuration pins
// what the recordings carry (`harness/recorded-rounds.ts`), and the fake RPC
// endpoints give block N its recorded hash. The page is the Wrapper's release
// bundle's `verify/` (unmodified); a bundle without it fails the rows with a
// message, never skips them.

import type { Page } from "@playwright/test";

import {
  recordedBlock,
  recordedRound,
  recordedRoundId,
  tamperedRecordedRound,
  type RecordedKind,
  type RecordedTamper,
} from "./harness/recorded-rounds.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";

test.use({ verifyRounds: "recorded" });

const TEXT = {
  matches: "This round matches its evidence",
  mismatch: "This round does not match its evidence",
} as const;

const CHECK = {
  5: "5. Commitment and reveal",
  6: "6. Block N",
  7: "7. Seed and outcome",
} as const;

const KINDS = ["won", "lost"] as const satisfies readonly RecordedKind[];

const heading = (page: Page, name: string): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 1, name });

const checkHeading = (
  page: Page,
  title: string,
): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 3, name: `${title}:` });

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

/** The payout each recording settled with, as the page writes it (OQ-B9). */
const PAYOUT = { won: "1.94 EUR", lost: "0 EUR" } as const;

test.describe("the verify page, for rounds the backend recorded (VT-5)", () => {
  for (const kind of KINDS) {
    test(`recomputes checks 5 and 7 of a recorded ${kind} round, and it matches`, async ({
      page,
      fakeVerifyApi,
      verifyPage,
      verifyRpc,
    }) => {
      const roundId = recordedRoundId(kind);
      fakeVerifyApi.answerEvery(roundId, {
        kind: "round",
        body: recordedRound(kind),
      });
      await verifyPage.open(page, roundId);
      await expect(heading(page, TEXT.matches)).toBeVisible();
      await Promise.all(
        ([1, 2, 3, 4, 5, 6, 7] as const).map(id =>
          expect(
            page.getByRole("heading", { level: 3, name: `${String(id)}.` }),
          ).toContainText("matches"),
        ),
      );
      // Checks 5 and 7 ran (a check that did not run reads "not checked").
      await expect(checkHeading(page, CHECK[5])).toContainText("matches");
      await expect(checkHeading(page, CHECK[7])).toContainText("matches");
      // Check 7 recomputed the payout, so the summary does not call it unchecked.
      const summary = page.locator(".vp-summary");
      await expect(summary).toContainText(PAYOUT[kind]);
      await expect(summary).not.toContainText("not checked");
      // Check 6 read the recorded block from both endpoints.
      await expect(page.getByText(recordedBlock().hash).first()).toBeVisible();
      expect(
        verifyRpc
          .calls()
          .map(call => `${call.provider} ${call.method}`)
          .toSorted(),
      ).toEqual([
        "p1 eth_chainId",
        "p1 eth_getBlockByNumber",
        "p2 eth_chainId",
        "p2 eth_getBlockByNumber",
      ]);
      expect(fakeVerifyApi.reads()).toEqual([{ roundId, answered: "round" }]);
    });

    for (const [tamper, check] of [
      ["loser", 7],
      ["payout", 7],
      ["roundSecret", 5],
    ] as const satisfies readonly (readonly [RecordedTamper, 5 | 7])[]) {
      test(`names check ${String(check)} when a recorded ${kind} round's ${tamper} is tampered`, async ({
        page,
        fakeVerifyApi,
        verifyPage,
      }) => {
        const roundId = recordedRoundId(kind);
        fakeVerifyApi.answerEvery(roundId, {
          kind: "round",
          body: tamperedRecordedRound(kind, tamper),
        });
        await verifyPage.open(page, roundId);
        await expect(heading(page, TEXT.mismatch)).toBeVisible();
        await expect(checkHeading(page, CHECK[check])).toContainText(
          "does not match",
        );
        await expect(
          page.getByRole("listitem").filter({ hasText: CHECK[check] }).first(),
        ).toBeVisible();
        // The checks that recompute nothing the tamper touched still match.
        await expect(checkHeading(page, CHECK[6])).toContainText("matches");
      });
    }
  }
});
