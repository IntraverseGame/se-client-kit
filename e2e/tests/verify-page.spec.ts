// VT-5 (specs/verify-page.md): the verify page in a browser, against the e2e
// fake of the verify API and the fake RPC endpoints of check 6. The page is the
// Wrapper's release bundle's `verify/` (unmodified), served with the host's
// rewrite of `/verify/rounds/*`; no request leaves the fake origins (the
// hermetic guard fails the test for one, VT-8's last clause).
//
// The rows run against the bundle's page; a bundle without it
// (verifyPageBuilt) fails them, with a message, never skips them.
// The texts are the page's English catalogue (`apps/verify/src/messages.ts`); a
// heading's accessible name starts with its icon's text, so a name is matched by
// what it contains.

import type { Page } from "@playwright/test";

import { blockHash } from "./harness/fake-rpc.ts";
import { ROUND } from "./harness/round-vector.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  verifyUrl,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import {
  matchingRound,
  notEndedRound,
  refusedRound,
  tamperedRound,
  type TamperedCheck,
  unknownKernelRound,
  UNKNOWN_ROUND_ID,
  VERIFY_ROUND_ID,
  voidedRound,
} from "./harness/verify-rounds.ts";

/** The note of a check whose reveal is absent (check 5 recomputes nothing). */
const MISSING_REVEAL = "A reveal is missing.";

const TEXT = {
  start: "Verify a round",
  matches: "This round matches its evidence",
  mismatch: "This round does not match its evidence",
  chainUnverified: "This round could not be verified against the chain",
  notEnded: "This round has not ended yet",
  voided: "This round was voided",
  refused: "This round was refused",
  notFound: "Round not found",
  apiError: "The verification service could not answer",
  unreachable: "The verification service could not be reached",
  retry: "Try again",
  unknownKernel: "This round cannot be recomputed",
} as const;

/** The check titles of V-12, as the page numbers them. */
const CHECK = {
  1: "1. Round id",
  2: "2. Entropy target",
  3: "3. The backend's signature",
  4: "4. Ready evidence",
  5: "5. Commitment and reveal",
  6: "6. Block N",
} as const;

const heading = (page: Page, name: string): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 1, name });

/**
 * A check's heading, such as "2. Entropy target: does not match" (its status
 * icon adds a word before it, so the name is matched by what it contains).
 */
const checkHeading = (
  page: Page,
  title: string,
): ReturnType<Page["getByRole"]> =>
  page.getByRole("heading", { level: 3, name: `${title}:` });

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page (VT-5)", () => {
  test("shows a pasted round id matched", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    await verifyPage.open(page);
    await expect(heading(page, TEXT.start)).toBeVisible();
    await page.getByLabel("Round id").fill(VERIFY_ROUND_ID);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(heading(page, TEXT.matches)).toBeVisible();
    expect(page.url()).toBe(verifyUrl(VERIFY_ROUND_ID));
    await expect(checkHeading(page, CHECK[6])).toContainText("matches");
    expect(fakeVerifyApi.reads()).toEqual([
      { roundId: VERIFY_ROUND_ID, answered: "round" },
    ]);
  });

  test("shows a round opened by its URL matched, with block N read from both endpoints", async ({
    page,
    fakeVerifyApi,
    verifyPage,
    verifyRpc,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.matches)).toBeVisible();
    await Promise.all(
      ([1, 2, 3, 4, 6] as const).map(id =>
        expect(checkHeading(page, CHECK[id])).toContainText("matches"),
      ),
    );
    const asked = verifyRpc
      .calls()
      .map(call => `${call.provider} ${call.method}`);
    expect(asked.toSorted()).toEqual([
      "p1 eth_chainId",
      "p1 eth_getBlockByNumber",
      "p2 eth_chainId",
      "p2 eth_getBlockByNumber",
    ]);
    await expect(
      page.getByText(blockHash(ROUND.blockNumber, "a")).first(),
    ).toBeVisible();
  });

  for (const check of [
    2, 3, 4, 5, 6,
  ] as const satisfies readonly TamperedCheck[]) {
    test(`names check ${String(check)} when its field is tampered`, async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: tamperedRound(check),
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(heading(page, TEXT.mismatch)).toBeVisible();
      await expect(checkHeading(page, CHECK[check])).toContainText(
        "does not match",
      );
      // Check 5 compares the commitments: both reveals are given, so the page
      // does not stop at "a reveal is missing".
      await expect(page.getByText(MISSING_REVEAL)).toHaveCount(0);
      // The failed checks are listed by their numbers and titles.
      await expect(
        page.getByRole("listitem").filter({ hasText: CHECK[check] }).first(),
      ).toBeVisible();
    });
  }

  test("names check 1 when the round is not the one asked for", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(UNKNOWN_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    await verifyPage.open(page, UNKNOWN_ROUND_ID);
    await expect(heading(page, TEXT.mismatch)).toBeVisible();
    await expect(checkHeading(page, CHECK[1])).toContainText("does not match");
  });

  test("could not verify the chain when the endpoints disagree", async ({
    page,
    fakeVerifyApi,
    verifyPage,
    verifyRpc,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    verifyRpc.behave("p2", "other-hash");
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.chainUnverified)).toBeVisible();
    await expect(checkHeading(page, CHECK[6])).toContainText(
      "could not be verified",
    );
  });

  test("shows that a round is not found", async ({ page, verifyPage }) => {
    await verifyPage.open(page, UNKNOWN_ROUND_ID);
    await expect(heading(page, TEXT.notFound)).toBeVisible();
    await expect(page.getByText(UNKNOWN_ROUND_ID).first()).toBeVisible();
  });

  test("shows an API error, and the retry reads again", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answer(VERIFY_ROUND_ID, { kind: "error", status: 500 });
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: matchingRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.apiError)).toBeVisible();
    await page.getByRole("button", { name: TEXT.retry }).click();
    await expect(heading(page, TEXT.matches)).toBeVisible();
  });

  test("shows an API error for a body that does not validate", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, { kind: "unreadable" });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.apiError)).toBeVisible();
  });

  test("shows that the service is unreachable when the route is aborted", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, { kind: "abort" });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.unreachable)).toBeVisible();
    await expect(page.getByRole("button", { name: TEXT.retry })).toBeVisible();
  });

  test("shows a round that has not ended", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: notEndedRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.notEnded)).toBeVisible();
  });

  for (const [name, body, title] of [
    ["voided", voidedRound, TEXT.voided],
    ["refused", refusedRound, TEXT.refused],
  ] as const) {
    test(`says a ${name} round was ${name}, with nothing to check again`, async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: body(),
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(heading(page, title)).toBeVisible();
      await expect(heading(page, TEXT.notEnded)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Check again" }),
      ).toHaveCount(0);
      // The backend's reason and code are not shown.
      await expect(page.getByText("ENTROPY_TIMEOUT")).toHaveCount(0);
      await expect(page.getByText("INSUFFICIENT_FUNDS")).toHaveCount(0);
    });
  }

  test("shows a round of a kernel version it does not know", async ({
    page,
    fakeVerifyApi,
    verifyPage,
  }) => {
    fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
      kind: "round",
      body: unknownKernelRound(),
    });
    await verifyPage.open(page, VERIFY_ROUND_ID);
    await expect(heading(page, TEXT.unknownKernel)).toBeVisible();
  });
});
