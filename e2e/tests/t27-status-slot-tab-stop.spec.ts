// T-27 (W-57 "Overflow stays in the bar", W-49f): the status slot is a tab stop
// exactly while its text overflows, also when only the operator links changed
// its width. A start's call takes the links away and its end brings them back
// beside the slot, on the same row, with no change of the bar's height, so the
// bar's resize observer has nothing to answer: the update that shows the links
// decides the tab stop, in the real layout of every browser project.

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import { embedWrapper, serveListing } from "./harness/operator-page.ts";
import { OPERATOR_ORIGIN } from "./harness/origins.ts";
import { expect, test } from "./harness/round-play.ts";
import { ROUND_PINS } from "./harness/round-vector.ts";
import { TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

/**
 * Whether the status slot overflows with the operator links as they are, and
 * with them out of the layout, in one synchronous read.
 */
const overflowWithAndWithoutLinks = (slot: Element): readonly boolean[] => {
  const overflows = (): boolean =>
    slot.scrollHeight > slot.clientHeight ||
    slot.scrollWidth > slot.clientWidth;
  const links = document.querySelector<HTMLElement>(".se-links");
  const withLinks = overflows();
  links?.style.setProperty("display", "none");
  const withoutLinks = overflows();
  links?.style.removeProperty("display");
  return [withLinks, withoutLinks];
};

test("the status slot takes its tab stop when the links narrow it, and the bar's height stays", async ({
  context,
  page,
  fakePlayApi,
  playApiBaseUrl,
}) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
  fakePlayApi.answerEvery("getSnapshot", {
    kind: "snapshot",
    vector: "coinflip-idle",
    links: {
      lobby: `${OPERATOR_ORIGIN}/lobby`,
      deposit: `${OPERATOR_ORIGIN}/deposit`,
    },
  });
  fakePlayApi.answerEvery("startRound", {
    kind: "problem",
    vector: "problem-insufficient-funds",
  });
  // From 52rem (832 CSS pixels): the status slot, the controls, and the links
  // share one row.
  const frame = await embedWrapper(page, fakePlayApi.launchUrl(WRAPPER_PAGE), {
    box: { width: 840, height: 720 },
  });
  await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
  const bar = frame.locator(".se-bar");
  const before = await bar.boundingBox();
  await frame.getByRole("button", { name: TEXT.placeBet }).click();
  // The error fills the slot while the links are gone; then they come back.
  await expect(frame.locator(".se-alert")).toContainText(
    "Your balance is too low for this bet.",
  );
  await expect(frame.locator(".se-links a")).toHaveCount(2);
  const slot = frame.locator(".se-status-slot");
  // The links are what makes it overflow.
  expect(await slot.evaluate(overflowWithAndWithoutLinks)).toEqual([
    true,
    false,
  ]);
  expect((await bar.boundingBox())?.height).toBe(before?.height);
  await expect(slot).toHaveAttribute("tabindex", "0");
});
