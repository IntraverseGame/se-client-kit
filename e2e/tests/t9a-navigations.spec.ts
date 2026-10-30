// T-9a's navigations (W-49e, W-49f), on each engine the suite runs: the
// Wrapper embedded by the listed fake operator, its handshake done, at `idle`
// with the Snapshot's `context.links` on the operator's origin. The deposit
// control opens a new page with no `window.opener` and no `Referer`, and the
// Wrapper's session stays open; the lobby control navigates the top-level
// window to the operator's lobby. T-13's secret scan also runs over every
// message the operator page received and every navigation URL. While the start
// call is in flight, neither control is offered (W-49f).

import { environmentConfig } from "./harness/environment-config.ts";
import { expect, test } from "./harness/fixtures.ts";
import {
  embedWrapper,
  OPERATOR_LINKS,
  operatorReceived,
  secretsIn,
  serveListing,
} from "./harness/operator-page.ts";
import { keyDrawSecrets } from "./harness/random-stub.ts";
import { servedFor, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

test.describe("T-9a: the lobby and deposit navigations", () => {
  test("the deposit opens apart with no opener or referrer; the lobby navigates the operator's page", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
    randomDraws,
  }) => {
    await serveListing(context, environmentConfig(playApiBaseUrl));
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
      links: OPERATOR_LINKS,
    });
    const navigations: string[] = [];
    const launchUrl = fakePlayApi.launchUrl(WRAPPER_PAGE);
    context.on("page", opened => {
      opened.on("framenavigated", frame => navigations.push(frame.url()));
    });
    page.on("framenavigated", frame => navigations.push(frame.url()));
    const frame = await embedWrapper(page, launchUrl);
    await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);

    // The deposit: a new browsing context, the session left as it was.
    const depositRequest = context.waitForEvent("request", request =>
      request.url().startsWith(OPERATOR_LINKS.deposit),
    );
    const popup = context.waitForEvent("page");
    await frame.getByRole("link", { name: /Make a deposit/u }).click();
    const deposit = await popup;
    await deposit.waitForLoadState();
    expect(deposit.url()).toBe(OPERATOR_LINKS.deposit);
    expect(await deposit.evaluate(() => window.opener === null)).toBe(true);
    const headers = await (await depositRequest).allHeaders();
    expect(headers["referer"]).toBeUndefined();
    expect(await deposit.evaluate(() => document.referrer)).toBe("");
    await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
    expect(servedFor(fakePlayApi, "redeemLaunchCode")).toHaveLength(1);

    const received = await operatorReceived(page);
    expect(received[0]).toEqual({ schema: "se.operator/1", type: "welcome" });

    // The lobby: the player's click navigates the top-level window.
    await frame.getByRole("link", { name: TEXT.lobby }).click();
    await page.waitForURL(OPERATOR_LINKS.lobby);
    await expect(page.getByRole("heading")).toHaveText("Fake operator lobby");

    // No secret in a message or a navigation URL, but for the one launch
    // navigation, whose fragment is the launch code by design (W-1).
    const texts = [
      ...received.map(message => JSON.stringify(message)),
      ...navigations.filter(url => url !== launchUrl),
    ];
    expect(
      secretsIn(texts, [fakePlayApi.secrets, keyDrawSecrets(randomDraws)]),
    ).toEqual([]);
  });

  test("no lobby or deposit while the start call is in flight", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await serveListing(context, environmentConfig(playApiBaseUrl));
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
      links: OPERATOR_LINKS,
    });
    // The start is never answered within the test: its call stays in flight.
    fakePlayApi.answer("startRound", { kind: "hang" });
    const frame = await embedWrapper(page, fakePlayApi.launchUrl(WRAPPER_PAGE));
    const lobby = frame.getByRole("link", { name: TEXT.lobby });
    const deposit = frame.getByRole("link", { name: /Make a deposit/u });
    await expect(lobby).toBeVisible();
    await expect(deposit).toBeVisible();
    await frame.getByRole("button", { name: TEXT.placeBet }).click();
    await expect(lobby).toHaveCount(0);
    await expect(deposit).toHaveCount(0);
    await expect
      .poll(() => servedFor(fakePlayApi, "startRound").length)
      .toBe(1);
  });
});
