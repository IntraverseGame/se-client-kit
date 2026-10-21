// VT-6 (specs/verify-page.md, W-39): from the Wrapper, after a round ends, the
// verify link opens `<verifyBaseUrl>/rounds/{roundId}` in a new context, and
// that page (the release bundle's, under `/verify/`, against the fake verify
// API and the fake RPC endpoints) recomputes the round and reaches V-6. The
// configuration points `verifyBaseUrl` at the Wrapper's own origin plus
// `/verify`, as in preview (V-1), and `verifyApiBaseUrl` at the fake.

import { serveEnvironmentConfig } from "./harness/environment-config.ts";
import { createFakeVerifyApi } from "./harness/fake-verify-api.ts";
import { WRAPPER_ORIGIN } from "./harness/origins.ts";
import { callTails, expect, test, toReady } from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import {
  serveVerifyPage,
  verifyEnvironmentConfig,
  verifyPageBuilt,
  verifyUrl,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import { matchingRound } from "./harness/verify-rounds.ts";
import { statusHeading, TEXT } from "./harness/wrapper-page.ts";

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
});
