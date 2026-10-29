// VT-5 for book rounds (specs/verify-page.md, V-18 to V-20, #156): the verify
// page in a browser, against the e2e fake of the verify API serving the canned
// book rounds (verify-book-rounds.ts, from the vendored `valid/book-lifecycle-won`
// and `-lost` vectors) and the fake RPC endpoints giving block N the vector's
// `blockValue`. An ended book round reaches V-8's book reason, never V-10: the
// page recomputes the round secret's commitment, block N, and the seed, says
// checks 2 to 4 do not apply and check 8 is not checked, and shows the result
// and the payout as the verify API reports them. A tampered copy names the
// check it fails (5, 6, 7, or 8). The book reason passes the axe scan (VT-7).

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  BOOK_ENDINGS,
  BOOK_ROUND_ID,
  bookEnding,
  bookRound,
  tamperedBookRound,
  type TamperedBookCheck,
} from "./harness/verify-book-rounds.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";

const TEXT = {
  bookDraw: "This round's draw was not recomputed",
  mismatch: "This round does not match its evidence",
  apiError: "The verification service could not answer",
  asReported: "as the verify API reports it",
} as const;

const CHECK = {
  1: "1. Round id",
  2: "2. Entropy target",
  3: "3. The backend's signature",
  4: "4. Ready evidence",
  5: "5. Commitment and reveal",
  6: "6. Block N",
  7: "7. Seed",
  8: "8. The draw",
} as const;

const heading = (page: Page, name: string): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 1, name });

const checkHeading = (
  page: Page,
  title: string,
): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 3, name: `${title}:` });

test.use({ verifyRounds: "book" });

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page, book rounds (VT-5, #156)", () => {
  for (const ending of BOOK_ENDINGS) {
    const read = bookEnding(ending);

    test(`${ending}: reaches V-8's book reason, with the result and payout as the API's`, async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(BOOK_ROUND_ID, {
        kind: "round",
        body: bookRound(ending),
      });
      await verifyPage.open(page, BOOK_ROUND_ID);
      await expect(heading(page, TEXT.bookDraw)).toBeVisible();
      await expect(heading(page, TEXT.apiError)).toHaveCount(0);
      await Promise.all([
        ...([1, 5, 6, 7] as const).map(id =>
          expect(checkHeading(page, CHECK[id])).toContainText("matches"),
        ),
        ...([2, 3, 4] as const).map(id =>
          expect(checkHeading(page, CHECK[id])).toContainText("does not apply"),
        ),
        expect(checkHeading(page, CHECK[8])).toContainText("not checked"),
      ]);
      await expect(
        page.getByText(`a drawn round, mode ${read.mode}`),
      ).toBeVisible();
      await expect(page.getByText(`Result (${TEXT.asReported})`)).toBeVisible();
      await expect(page.getByText(`Payout (${TEXT.asReported})`)).toBeVisible();
      // The drawn row's multiplier, shown as a decimal and not checked.
      const milli = BigInt(read.multiplierMilli);
      const fraction = (milli % 1000n).toString().padStart(3, "0");
      await expect(
        page.getByText(`${(milli / 1000n).toString()}.${fraction}×`).first(),
      ).toBeVisible();
      // No control: the same evidence would give the same answer.
      await expect(
        page.getByRole("button", { name: "Check again" }),
      ).toHaveCount(0);
      // Not a failure: nothing in the (always present) alert region.
      await expect(page.locator('[role="alert"]')).toHaveText("");
    });

    for (const check of [
      5, 6, 7, 8,
    ] as const satisfies readonly TamperedBookCheck[]) {
      test(`${ending}: names check ${String(check)} when its field is tampered`, async ({
        page,
        fakeVerifyApi,
        verifyPage,
      }) => {
        fakeVerifyApi.answerEvery(BOOK_ROUND_ID, {
          kind: "round",
          body: tamperedBookRound(ending, check),
        });
        await verifyPage.open(page, BOOK_ROUND_ID);
        await expect(heading(page, TEXT.mismatch)).toBeVisible();
        await expect(checkHeading(page, CHECK[check])).toContainText(
          "does not match",
        );
        await expect(
          page.getByRole("listitem").filter({ hasText: CHECK[check] }).first(),
        ).toBeVisible();
        // No result is shown as established, nor as the API's.
        await expect(page.getByText(`Result (${TEXT.asReported})`)).toHaveCount(
          0,
        );
      });
    }
  }
});

test.describe("the verify page's accessibility, book rounds (VT-7, #156)", () => {
  test("axe on V-8's book reason", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(BOOK_ROUND_ID, {
      kind: "round",
      body: bookRound("book-lifecycle-won"),
    });
    await verifyPage.open(page, BOOK_ROUND_ID);
    await expect(heading(page, TEXT.bookDraw)).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
