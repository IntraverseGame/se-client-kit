// VT-16's browser rows (V-22, specs/verify-page.md): a round started with a
// key delegation, from the verify API's body to check 9 as the page renders
// it, which no unit test crosses, and the axe audit of V-6 and V-7 with it.
// The delegation is the vendored vector's (`verify-delegated-rounds.ts`). The
// texts are the page's English catalogue (`apps/verify/src/messages.ts`).

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  delegatedRound,
  tamperedDelegatedRound,
  vectorDelegation,
} from "./harness/verify-delegated-rounds.ts";
import {
  expect,
  test,
  VERIFY_PAGE_NOT_BUILT,
  verifyPageBuilt,
} from "./harness/verify-page.ts";
import { VERIFY_ROUND_ID } from "./harness/verify-rounds.ts";

const MATCHES = "This round matches its evidence";
const MISMATCH = "This round does not match its evidence";
const STATEMENT = "This wallet signed, for this round's key, the text below.";

const h1 = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });

/** Check 9's list item, by its heading. */
const check9 = (page: Page) =>
  page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: "9. Wallet link:" }),
  });

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page's key delegation (VT-16)", () => {
  test("a delegated round matches, and check 9 shows the wallet and the notice", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    const delegation = vectorDelegation();
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: delegatedRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(h1(page, MATCHES)).toBeVisible();
    const check = check9(page);
    await expect(check.getByRole("heading", { level: 3 })).toContainText(
      "matches",
    );
    await expect(check.getByText(STATEMENT)).toBeVisible();
    await expect(check.locator("blockquote")).toHaveText(
      String(delegation["notice"]),
    );
    await expect(
      check.locator(".vp-row", { hasText: /^Wallet/u }).locator("dd code"),
    ).toHaveText(String(delegation["wallet"]));
    await expect(
      check.locator(".vp-row", { hasText: /^Notice id/u }).locator("dd"),
    ).toHaveText("en-draft-1");
    await expect(
      check
        .locator(".vp-row", { hasText: "In this page's list of notices" })
        .locator("dd"),
    ).toHaveText("pending");
    await expect(
      check.locator(".vp-row", { hasText: /^Expiry/u }).locator("dd"),
    ).toContainText("(1795000000 unix seconds)");
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("a delegation whose expiry is not after acceptedAt names check 9", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: tamperedDelegatedRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(h1(page, MISMATCH)).toBeVisible();
    await expect(check9(page).getByRole("heading", { level: 3 })).toContainText(
      "does not match",
    );
    await expect(
      page.getByRole("alert").getByRole("listitem").filter({
        hasText: "9. Wallet link",
      }),
    ).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
