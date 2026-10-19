// T-20 (W-29, W-35): a later read can carry a lower `version` than the one
// last shown. The move's answer here does (`resolving`, served at a `version`
// below the `active` round's): the Wrapper drops it, so no poll starts, and it
// reads the Snapshot again where none runs. The read it takes (`lost`) is
// shown, in the Wrapper and in the game, and the dropped answer never is.

import type { Page } from "@playwright/test";

import {
  advanceUntil,
  callTails,
  expect,
  gameFrame,
  shows,
  snapshotAnswer,
  test,
  toReady,
} from "./harness/round-play.ts";
import { pickCheck } from "./harness/round-vector.ts";
import { validVector } from "./harness/vectors.ts";
import { servedFor, statusHeading, TEXT } from "./harness/wrapper-page.ts";

/** Records every status heading the Wrapper shows from now on. */
const recordHeadings = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const seen: string[] = [];
    (globalThis as { seenHeadings?: string[] }).seenHeadings = seen;
    new MutationObserver(() => {
      seen.push(document.querySelector(".se-status h1")?.textContent ?? "");
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

/** The status headings recorded since `recordHeadings`. */
const recordedHeadings = (page: Page): Promise<readonly string[]> =>
  page.evaluate(
    () => (globalThis as { seenHeadings?: string[] }).seenHeadings ?? [],
  );

const activeVersion = Number(
  validVector("coinflip-active-ready-hash", "Snapshot").input["version"],
);

test.describe("T-20: a Snapshot dropped for a lower version", () => {
  test("is read again where no poll runs, and the read taken reaches the game", async ({
    page,
    fakePlayApi,
  }) => {
    await toReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    await recordHeadings(page);
    const readsBefore = servedFor(fakePlayApi, "getSnapshot").length;
    fakePlayApi.answer("continueRound", {
      kind: "snapshot-version",
      vector: "coinflip-resolving",
      version: activeVersion - 1,
      expect: pickCheck,
    });
    fakePlayApi.answer("getSnapshot", snapshotAnswer("coinflip-lost"));
    await callTails(page);
    await advanceUntil(page, shows(statusHeading(page), TEXT.lost));
    // One re-read, after the move's dropped answer.
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "getSnapshot").length).toBe(readsBefore + 1);
    // The game gets the read the Wrapper took, through the bridge (its frame
    // is hidden once the round is over, W-31).
    await expect(gameFrame(page).locator("#rg-heading")).toHaveText("You lost");
    // W-29: the dropped `resolving` was never shown.
    expect(await recordedHeadings(page)).not.toContainEqual(
      expect.stringContaining(TEXT.resolving),
    );
    // Nothing more is read for a round that is over.
    await page.clock.runFor(60_000);
    expect(servedFor(fakePlayApi, "getSnapshot").length).toBe(readsBefore + 1);
  });
});
