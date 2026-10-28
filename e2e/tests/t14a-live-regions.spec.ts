// T-14a (AC5, W-46, W-47): a status change is announced through the polite
// live region and an error through `role="alert"`; focus moves to the error
// heading after the player's own action, never after a poll (except the one
// poll that brings the result of the book round the player just started,
// W-55, covered by the Wrapper's component tests); the result
// carries text and an icon with a text alternative; `prefers-reduced-motion`
// stops the progress animation; and the UI works at 200 % zoom.

import { expect, test } from "./harness/fixtures.ts";
import {
  alertPanel,
  launch,
  launchAndStart,
  liveRegion,
  scriptStartingRound,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

test.describe("T-14a: live regions and visual rules", () => {
  test("a status change is announced politely", async ({
    page,
    fakePlayApi,
  }) => {
    scriptStartingRound(fakePlayApi);
    await launchAndStart(page, fakePlayApi);
    await expect(liveRegion(page)).toHaveText(TEXT.starting);
  });

  test("an error after the player's start is an alert, and takes the focus", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    fakePlayApi.answer("startRound", {
      kind: "problem",
      vector: "problem-insufficient-funds",
    });
    await launchAndStart(page, fakePlayApi);
    await expect(alertPanel(page)).toContainText(TEXT.error);
    await expect(page.locator("#se-alert-heading")).toBeFocused();
  });

  test("a result a poll brings does not move the focus, and has text and an icon", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    fakePlayApi.answer("startRound", {
      kind: "snapshot",
      vector: "coinflip-starting-created",
    });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-lost",
    });
    await launchAndStart(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText("You lost");
    await expect(statusHeading(page)).not.toBeFocused();
    await expect(
      statusHeading(page).getByRole("img", { name: "Loss" }),
    ).toHaveCount(1);
  });

  test("prefers-reduced-motion stops the progress animation", async ({
    page,
    fakePlayApi,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-resolving",
    });
    await launch(page, fakePlayApi);
    const icon = page.locator(".se-status .se-icon--progress");
    await expect(icon).toHaveCount(1);
    // Polled: the section is rebuilt as the first read arrives.
    await expect
      .poll(() =>
        icon.evaluate(element => getComputedStyle(element).animationName),
      )
      .toBe("none");
  });

  test("works at 200 % zoom: no horizontal scroll, the start reachable", async ({
    page,
    fakePlayApi,
  }) => {
    // 200 % zoom of a 1280 by 720 window is a 640 by 360 CSS-pixel viewport.
    await page.setViewportSize({ width: 640, height: 360 });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    const start = page.getByRole("button", { name: TEXT.start });
    await start.scrollIntoViewIfNeeded();
    await expect(start).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
