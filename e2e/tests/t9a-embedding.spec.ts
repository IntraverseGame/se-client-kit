// T-9a's browser half, the W-49 minimum only (on Chromium, which has
// `location.ancestorOrigins`): the release bundle framed by a page off
// `operatorOrigins` refuses to start and sends nothing to the Play API; framed
// by a listed page it opens the session. The path without
// `location.ancestorOrigins` (Firefox: no session while framed) and the
// operator handshake of RFC-001 are not in this run; the first is a component
// test, the second is not built.

import type { Frame, Page } from "@playwright/test";

import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import type { FakePlayApi } from "./harness/fake-play-types.ts";
import { expect, test } from "./harness/fixtures.ts";
import { frameNamed } from "./harness/frames.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { servedFor, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

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

  test("framed by a listed page, it opens the session", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await serveEnvironmentConfig(context, {
      ...environmentConfig(playApiBaseUrl),
      operatorOrigins: [PAGES_ORIGIN],
    });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    const frame = await framedLaunch(page, fakePlayApi);
    await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);
  });
});
