// The game iframe's mount on the release bundle (W-37): D is the redeem
// answer's `gameOrigin` and nothing else, checked against the configuration's
// `gameOrigins`. On the list, the sandboxed frame loads the reference game at
// D, with the Wrapper's origin as `parentOrigin`, and shows from its mount,
// inert while no round is playable (W-57, W-58). Off the list, no frame is left and nothing is ever
// requested from D.

import {
  environmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import { expect, test } from "./harness/fixtures.ts";
import { GAME_ORIGIN, WRAPPER_ORIGIN } from "./harness/origins.ts";
import { launch, statusHeading, TEXT } from "./harness/wrapper-page.ts";

test.describe("the game iframe (W-37)", () => {
  test("mounts the reference game at the redeem answer's D, shown and inert at idle", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    const frame = page.locator("iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute(
      "src",
      `${GAME_ORIGIN}/?parentOrigin=${encodeURIComponent(WRAPPER_ORIGIN)}`,
    );
    await expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("inert", "");
    await expect
      .poll(() =>
        page.frames().some(f => f.url().startsWith(`${GAME_ORIGIN}/`)),
      )
      .toBe(true);
  });

  test("refuses a D off gameOrigins: no frame, and nothing requested from D", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    await serveEnvironmentConfig(context, {
      ...environmentConfig(playApiBaseUrl),
      gameOrigins: ["https://other.e2e-games.test"],
    });
    const requested: string[] = [];
    context.on("request", request => {
      requested.push(request.url());
    });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(requested.filter(url => url.startsWith(`${GAME_ORIGIN}/`))).toEqual(
      [],
    );
  });
});
