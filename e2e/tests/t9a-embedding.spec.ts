// T-9a's browser half, the W-49 minimum only, in every project: the release
// bundle framed by a page off `operatorOrigins` refuses to start and sends
// nothing to the Play API. Framed by a listed page, it opens the session where
// `location.ancestorOrigins` exists (Chromium, WebKit) and refuses to start
// where it does not (Firefox: no session while framed, until RFC-001's
// handshake). Which projects have the list is itself asserted, so the two
// paths cannot silently swap. The operator handshake of RFC-001 is not built.

import type { BrowserContext, Frame, Page } from "@playwright/test";

import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import { expect, test } from "./harness/fixtures.ts";
import { frameNamed } from "./harness/frames.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { servedFor, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

/**
 * Whether each project's browser has `location.ancestorOrigins` (W-49): the
 * Wrapper checks the list where it exists, and opens no framed session where it
 * does not.
 */
const HAS_ANCESTOR_ORIGINS: Readonly<
  Record<"chromium" | "firefox" | "webkit", boolean>
> = { chromium: true, firefox: false, webkit: true };

/** Serves a configuration whose `operatorOrigins` lists the test pages. */
const listOperator = (
  context: BrowserContext,
  playApiBaseUrl: string,
): Promise<void> =>
  serveEnvironmentConfig(context, {
    ...environmentConfig(playApiBaseUrl),
    operatorOrigins: [PAGES_ORIGIN],
  });

/** Opens a test page on PAGES_ORIGIN that frames the Wrapper's launch URL. */
const framedLaunch = async (page: Page, fake: FakePlayApi): Promise<Frame> => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
  await page.evaluate(url => {
    const frame = document.createElement("iframe");
    frame.name = "wrapper";
    frame.title = "Wrapper";
    frame.src = url;
    document.body.append(frame);
  }, fake.launchUrl(WRAPPER_PAGE));
  return frameNamed(page, "wrapper");
};

test.describe("T-9a: operator embedding, the W-49 minimum", () => {
  test("framed by an unlisted page, it refuses to start and redeems nothing", async ({
    page,
    fakePlayApi,
  }) => {
    // The harness's document lists no operator origin.
    const frame = await framedLaunch(page, fakePlayApi);
    await expect(frame.getByText(TEXT.configuration)).toBeVisible();
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toEqual([]);
    expect(fakePlayApi.served).toEqual([]);
  });

  test("location.ancestorOrigins exists in every project but Firefox", async ({
    page,
    browserName,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    expect({
      browserName,
      ancestorOrigins: await page.evaluate(() => "ancestorOrigins" in location),
    }).toEqual({
      browserName,
      ancestorOrigins: HAS_ANCESTOR_ORIGINS[browserName],
    });
  });

  test.describe("where location.ancestorOrigins exists", () => {
    test.skip(
      ({ browserName }) => !HAS_ANCESTOR_ORIGINS[browserName],
      "Firefox has no location.ancestorOrigins: its path is the next test",
    );

    test("framed by a listed page, it opens the session", async ({
      page,
      context,
      fakePlayApi,
      playApiBaseUrl,
    }) => {
      await listOperator(context, playApiBaseUrl);
      fakePlayApi.answerEvery("getSnapshot", {
        kind: "snapshot",
        vector: "coinflip-idle",
      });
      const frame = await framedLaunch(page, fakePlayApi);
      await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
      expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
    });
  });

  test.describe("where location.ancestorOrigins does not exist", () => {
    test.skip(
      ({ browserName }) => HAS_ANCESTOR_ORIGINS[browserName],
      "the browser has location.ancestorOrigins: its path is the previous test",
    );

    test("framed by a listed page, it still refuses to start and redeems nothing", async ({
      page,
      context,
      fakePlayApi,
      playApiBaseUrl,
    }) => {
      await listOperator(context, playApiBaseUrl);
      const frame = await framedLaunch(page, fakePlayApi);
      await expect(frame.getByText(TEXT.configuration)).toBeVisible();
      expect(servedFor(fakePlayApi, "redeemLaunchCode")).toEqual([]);
      expect(fakePlayApi.served).toEqual([]);
    });
  });
});
