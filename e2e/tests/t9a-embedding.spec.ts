// T-9a's browser half (W-49 to W-49c), in every project: the release bundle
// embedded by the fake operator page (harness/operator-page.ts). Every
// project's browser has `location.ancestorOrigins` (Firefox's too, as its first
// run showed, 2026-10-18), and that is asserted, so a browser without it
// cannot pass this file silently; the Wrapper's path without the list is a
// component test (apps/wrapper, operator-gate.test.ts).
// - Without the `frame-ancestors` header (the suite's default, to prove the
//   JavaScript layer alone): an unlisted framer gets the configuration-error
//   state and nothing is redeemed; a listed operator that sends `hello` gets
//   `welcome` and the session; one that sends nothing reaches the timeout
//   state; a page that nests the Wrapper is refused; and a listed framer whose
//   iframe has `referrerpolicy="no-referrer"` is refused where the engine masks
//   the entry, which the test records.
// - With the header: an unlisted framer gets no Wrapper document at all.
// The round, `resize`, and the navigations are in t9a-operator-round.spec.ts
// and t9a-navigations.spec.ts.

import type { BrowserContext, Frame, Page } from "@playwright/test";

import { environmentConfig } from "./harness/environment-config.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  embedWrapper,
  operatorReceived,
  serveListing,
  serveWithFrameAncestors,
  startEmbedding,
  wrapperLoads,
} from "./harness/operator-page.ts";
import {
  OPERATOR_ORIGIN,
  PAGES_ORIGIN,
  UNLISTED_ORIGIN,
  WRAPPER_ORIGIN,
} from "./harness/origins.ts";
import { servedFor, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

const WELCOME = { schema: "se.operator/1", type: "welcome" };

/** Serves a configuration whose `operatorOrigins` lists the fake operator. */
const listOperator = (
  context: BrowserContext,
  playApiBaseUrl: string,
): Promise<void> => serveListing(context, environmentConfig(playApiBaseUrl));

const idleSession = (fake: FakePlayApi): void => {
  fake.answerEvery("getSnapshot", {
    kind: "snapshot",
    vector: "coinflip-idle",
  });
};

const expectRefused = async (
  frame: Frame,
  fake: FakePlayApi,
): Promise<void> => {
  await expect(frame.getByText(TEXT.configuration)).toBeVisible();
  expect(servedFor(fake, "redeemLaunchCode")).toEqual([]);
  expect(fake.served).toEqual([]);
};

/**
 * A listed framer whose entry the engine masked (`"null"`) is refused (W-49a);
 * one whose entry it kept opens the session.
 */
const expectByMasking = async (
  frame: Frame,
  fake: FakePlayApi,
  ancestors: readonly string[],
): Promise<void> => {
  if (ancestors[0] === "null") {
    await expectRefused(frame, fake);
    return;
  }
  expect(ancestors).toEqual([OPERATOR_ORIGIN]);
  await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
};

/** The paths the page asks of the Wrapper's origin, from now on. */
const wrapperPaths = (page: Page): readonly string[] => {
  const paths: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin === WRAPPER_ORIGIN) paths.push(url.pathname);
  });
  return paths;
};

/** Moves the page's clock a second at a time until `frame` shows `text`. */
const runUntilShown = async (
  page: Page,
  frame: Frame,
  text: string,
): Promise<void> => {
  await expect
    .poll(
      async () => {
        if (await frame.getByText(text).isVisible()) return true;
        await page.clock.runFor(1000);
        return frame.getByText(text).isVisible();
      },
      { timeout: 15_000 },
    )
    .toBe(true);
};

test.describe("T-9a: operator embedding, without the frame-ancestors header", () => {
  test("location.ancestorOrigins exists in every project", async ({ page }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect(await page.evaluate(() => "ancestorOrigins" in location)).toBe(true);
  });

  test("an unlisted framer that sends hello gets the configuration-error state and no redeem", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await listOperator(context, playApiBaseUrl);
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      {
        origin: UNLISTED_ORIGIN,
      },
    );
    await expectRefused(frame, fakePlayApi);
    expect(await operatorReceived(page)).toEqual([]);
  });

  test("a listed operator that sends hello gets welcome, and the session opens", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await listOperator(context, playApiBaseUrl);
    idleSession(fakePlayApi);
    const frame = await embedWrapper(page, fakePlayApi.launchUrl(WRAPPER_PAGE));
    await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
    expect((await operatorReceived(page))[0]).toEqual(WELCOME);
    expect(await frame.evaluate(() => [...location.ancestorOrigins])).toEqual([
      OPERATOR_ORIGIN,
    ]);
  });

  test("a listed operator that sends nothing reaches the timeout state", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await page.clock.install();
    await listOperator(context, playApiBaseUrl);
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      {
        hello: false,
      },
    );
    await runUntilShown(page, frame, TEXT.configuration);
    await expectRefused(frame, fakePlayApi);
    expect(await operatorReceived(page)).toEqual([]);
  });

  test("a page that nests the Wrapper is refused", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await listOperator(context, playApiBaseUrl);
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      {
        nested: true,
      },
    );
    await expectRefused(frame, fakePlayApi);
    expect(await frame.evaluate(() => location.ancestorOrigins.length)).toBe(2);
  });

  test("a listed framer with referrerpolicy=no-referrer: refused where the engine masks the entry", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }, testInfo) => {
    await listOperator(context, playApiBaseUrl);
    idleSession(fakePlayApi);
    const frame = await embedWrapper(
      page,
      fakePlayApi.launchUrl(WRAPPER_PAGE),
      {
        referrerPolicy: "no-referrer",
      },
    );
    const ancestors = await frame.evaluate(() => [...location.ancestorOrigins]);
    // What this engine does, for the report (operator-embedding.md, masking).
    testInfo.annotations.push({
      type: "ancestorOrigins with referrerpolicy=no-referrer",
      description: JSON.stringify(ancestors),
    });
    await expectByMasking(frame, fakePlayApi, ancestors);
  });
});

test.describe("T-9a: operator embedding, with the frame-ancestors header", () => {
  test("an unlisted framer gets no Wrapper document; a listed one plays", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await listOperator(context, playApiBaseUrl);
    await serveWithFrameAncestors(context, [OPERATOR_ORIGIN]);
    idleSession(fakePlayApi);
    const wrapperRequests = wrapperPaths(page);
    await startEmbedding(page, fakePlayApi.launchUrl(WRAPPER_PAGE), {
      origin: UNLISTED_ORIGIN,
    });
    // The iframe's `load` fires once its document (or the error page) and
    // every subresource it asked for are in: none of the Wrapper's own was
    // asked for, so its code never ran.
    await expect.poll(() => wrapperLoads(page)).toBeGreaterThan(0);
    expect(wrapperRequests.filter(path => path !== "/")).toEqual([]);
    expect(fakePlayApi.served).toEqual([]);

    const frame = await embedWrapper(page, fakePlayApi.launchUrl(WRAPPER_PAGE));
    await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
  });
});
