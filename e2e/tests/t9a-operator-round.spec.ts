// T-9a, a listed operator that sends `hello` (W-49c, W-49d), in every project:
// `welcome` arrives, the vendored Coin Flip round plays to a win inside the
// operator's iframe, and `resize` arrives with exactly its fields; T-13's
// secret scan runs over the run and over every message the operator page
// received. The round harness scripts the session's key (round-play.ts).

import type { Frame } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import {
  embedWrapper,
  operatorReceived,
  secretsIn,
  serveListing,
} from "./harness/operator-page.ts";
import { keyDrawSecrets } from "./harness/random-stub.ts";
import {
  advanceUntil,
  expect,
  scriptRound,
  test,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_PINS } from "./harness/round-vector.ts";
import { servedFor, TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

/** The values equal to the one just before them. */
const repeats = (values: readonly number[]): readonly number[] =>
  values.filter((value, index) => value === values[index - 1]);

const heading = (frame: Frame): ReturnType<Frame["locator"]> =>
  frame.locator(".se-status h1");

test.describe("T-9a: a listed operator's round", () => {
  test("welcome, a round played to a win, and resize with exactly its fields", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
    randomDraws,
    secretScan,
  }) => {
    await serveListing(
      context,
      roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
    );
    scriptRound(fakePlayApi);
    const launchUrl = fakePlayApi.launchUrl(WRAPPER_PAGE);
    secretScan.allowLaunchNavigation(launchUrl);
    const frame = await embedWrapper(page, launchUrl);
    await expect(heading(frame)).toHaveText(TEXT.idle);
    await frame.getByRole("button", { name: TEXT.start }).click();
    // The `starting` poll (W-35) runs on the page's clock.
    const game = frame.locator("iframe");
    await advanceUntil(page, () => game.isVisible());
    await expect(heading(frame)).toHaveText(TEXT.active);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won-payout",
      expect: pickCheck,
    });
    await frame
      .frameLocator("iframe")
      .getByRole("button", { name: "Tails" })
      .click();
    await expect(heading(frame)).toHaveText(TEXT.won);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);

    const received = await operatorReceived(page);
    expect(received[0]).toEqual({ schema: "se.operator/1", type: "welcome" });
    const resizes = received.filter(
      message => (message as { type?: unknown }).type === "resize",
    );
    expect(resizes.length).toBeGreaterThan(0);
    for (const message of resizes) {
      const record = message as Readonly<Record<string, unknown>>;
      expect(Object.keys(record).toSorted()).toEqual([
        "height",
        "schema",
        "type",
      ]);
      expect(record["schema"]).toBe("se.operator/1");
      expect(Number.isInteger(record["height"])).toBe(true);
      expect(record["height"]).toBeGreaterThanOrEqual(1);
      expect(record["height"]).toBeLessThanOrEqual(16_384);
    }
    // Never the same value twice in a row.
    const heights = resizes.map(
      message => (message as { height: number }).height,
    );
    expect(repeats(heights)).toEqual([]);
    expect(
      secretsIn(
        received.map(message => JSON.stringify(message)),
        [fakePlayApi.secrets, keyDrawSecrets(randomDraws)],
      ),
    ).toEqual([]);
    await secretScan.expectClean();
  });
});
