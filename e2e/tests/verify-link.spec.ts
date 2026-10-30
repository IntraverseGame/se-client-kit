// VT-6 (specs/verify-page.md, W-39): from the Wrapper, after a round ends, the
// verify link opens `<verifyBaseUrl>/rounds/{roundId}` in a new context, and
// that page (the release bundle's, under `/verify/`, against the fake verify
// API and the fake RPC endpoints) recomputes the round and reaches V-6. The
// configuration points `verifyBaseUrl` at the Wrapper's own origin plus
// `/verify`, as in preview (V-1), and `verifyApiBaseUrl` at the fake. After a
// book round ends (T-24's round, #156), the link's page reaches V-8's book
// reason, never V-10: the fake serves the canned book round over the block
// hash the round fixtures' fake RPC endpoints give block N.

import { serveEnvironmentConfig } from "./harness/environment-config.ts";
import { blockHash } from "./harness/fake-rpc.ts";
import { createFakeVerifyApi } from "./harness/fake-verify-api.ts";
import { WRAPPER_ORIGIN } from "./harness/origins.ts";
import {
  advanceUntil,
  callTails,
  expect,
  shows,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import {
  BOOK_BLOCK_NUMBER,
  BOOK_ROUND_ID,
  bookRound,
} from "./harness/verify-book-rounds.ts";
import {
  serveVerifyPage,
  verifyEnvironmentConfig,
  verifyPageBuilt,
  verifyUrl,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import { matchingRound } from "./harness/verify-rounds.ts";
import { launch, statusHeading, TEXT } from "./harness/wrapper-page.ts";

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("VT-6: the Wrapper's verify link", () => {
  test("after a win, opens the verify page for the round in a new page, which recomputes it", async ({
    page,
    context,
    playApiBaseUrl,
    fakePlayApi,
  }) => {
    const verifyApiBaseUrl = `${WRAPPER_ORIGIN}/verify/v1`;
    // Registered after the round fixtures' configuration, so this one is served.
    await serveEnvironmentConfig(
      context,
      verifyEnvironmentConfig(playApiBaseUrl, verifyApiBaseUrl),
    );
    await serveVerifyPage(context);
    const verifyApi = createFakeVerifyApi({ baseUrl: verifyApiBaseUrl });
    await verifyApi.install(context);
    verifyApi.answerEvery(ROUND.roundId, {
      kind: "round",
      body: matchingRound(),
    });

    await toReady(page, fakePlayApi);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won-payout",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.won);

    const link = page.getByRole("link", { name: TEXT.verify });
    await expect(link).toHaveAttribute("href", verifyUrl(ROUND.roundId));
    const opened = context.waitForEvent("page");
    await link.click();
    const verifyPage = await opened;

    await expect(verifyPage).toHaveURL(verifyUrl(ROUND.roundId));
    await expect(
      verifyPage.getByRole("heading", {
        level: 1,
        name: "This round matches its evidence",
      }),
    ).toBeVisible();
    // The Wrapper's page stays where it was, showing the result.
    await expect(statusHeading(page)).toHaveText(TEXT.won);
    expect(verifyApi.reads()).toEqual([
      { roundId: ROUND.roundId, answered: "round" },
    ]);
    expect(verifyApi.unexpected()).toEqual([]);
  });

  test("after a book round ends, opens the verify page, which reaches V-8's book reason", async ({
    page,
    context,
    playApiBaseUrl,
    fakePlayApi,
  }) => {
    const verifyApiBaseUrl = `${WRAPPER_ORIGIN}/verify/v1`;
    await serveEnvironmentConfig(
      context,
      verifyEnvironmentConfig(playApiBaseUrl, verifyApiBaseUrl),
    );
    await serveVerifyPage(context);
    const verifyApi = createFakeVerifyApi({ baseUrl: verifyApiBaseUrl });
    await verifyApi.install(context);
    verifyApi.answerEvery(BOOK_ROUND_ID, {
      kind: "round",
      // Over the hash the round fixtures' fake RPC endpoints give block N.
      body: bookRound("book-lifecycle-won", blockHash(BOOK_BLOCK_NUMBER, "a")),
    });

    // T-24's round: idle, a start, the bound round, then won (W-50 to W-56).
    fakePlayApi.answer("getSnapshot", snapshotAnswer("book-lifecycle-idle"));
    fakePlayApi.answer(
      "startRound",
      snapshotAnswer("book-lifecycle-starting-funded"),
    );
    fakePlayApi.answer(
      "getSnapshot",
      snapshotAnswer("book-lifecycle-starting-bound"),
    );
    fakePlayApi.answerEvery(
      "getSnapshot",
      snapshotAnswer("book-lifecycle-won"),
    );
    await launch(page, fakePlayApi);
    await page.getByRole("button", { name: TEXT.placeBet }).click();
    await advanceUntil(page, shows(statusHeading(page), TEXT.won));

    const link = page.getByRole("link", { name: TEXT.verify });
    await expect(link).toHaveAttribute("href", verifyUrl(BOOK_ROUND_ID));
    const opened = context.waitForEvent("page");
    await link.click();
    const verifyPage = await opened;

    await expect(verifyPage).toHaveURL(verifyUrl(BOOK_ROUND_ID));
    await expect(
      verifyPage.getByRole("heading", {
        level: 1,
        name: "This round's draw was not recomputed",
      }),
    ).toBeVisible();
    await expect(
      verifyPage.getByRole("heading", {
        level: 1,
        name: "The verification service could not answer",
      }),
    ).toHaveCount(0);
    expect(verifyApi.reads()).toEqual([
      { roundId: BOOK_ROUND_ID, answered: "round" },
    ]);
    expect(verifyApi.unexpected()).toEqual([]);
  });
});
