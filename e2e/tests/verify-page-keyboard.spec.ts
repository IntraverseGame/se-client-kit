// VT-7 (specs/verify-page.md, V-14), the browser rows beside the axe scans of
// `verify-page-accessibility.spec.ts`: the keyboard-only use of the form and of
// the retry, the focus after a submit and after a retry (and none moved on its
// own), the polite live region and the alert, the focus indicator, the field's
// error tied to it, and 200 % zoom.

import type { Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  expect,
  test,
  verifyPageBuilt,
  VERIFY_PAGE_NOT_BUILT,
} from "./harness/verify-page.ts";
import { matchingRound, VERIFY_ROUND_ID } from "./harness/verify-rounds.ts";

const h1 = (page: Page): ReturnType<Page["locator"]> => page.locator("h1");
const polite = (page: Page): ReturnType<Page["locator"]> =>
  page.locator('[aria-live="polite"]');
const alert = (page: Page): ReturnType<Page["locator"]> =>
  page.locator('[role="alert"]');

/** 200 % zoom of a 1280 by 720 window is a 640 by 360 CSS-pixel viewport. */
const noHorizontalScroll = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

/** The text of the elements the field's `aria-describedby` names. */
const describedText = (field: ReturnType<Page["locator"]>): Promise<string> =>
  field.evaluate(
    element =>
      element
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map(id => document.querySelector(`#${id}`)?.textContent ?? "")
        .join(" ") ?? "",
  );

test.beforeAll(() => {
  if (!verifyPageBuilt()) throw new Error(VERIFY_PAGE_NOT_BUILT);
});

test.describe("the verify page's keyboard, focus, and zoom (VT-7)", () => {
  test.describe("keyboard, focus, and live regions", () => {
    test("the form is used by keyboard alone, and focus moves to the new state's heading", async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: matchingRound(),
      });
      await verifyPage.open(page);
      await expect(h1(page)).toContainText("Verify a round");
      // Nothing moved the focus on its own.
      await expect(h1(page)).not.toBeFocused();
      const field = page.getByLabel("Round id");
      await page.keyboard.press("Tab");
      await expect(field).toBeFocused();
      // The focus indicator is visible.
      const outline = await field.evaluate(element => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(outline.style).not.toBe("none");
      expect(outline.width).not.toBe("0px");
      await page.keyboard.type(VERIFY_ROUND_ID);
      await page.keyboard.press("Enter");
      await expect(h1(page)).toContainText("This round matches its evidence");
      await expect(h1(page)).toBeFocused();
      // The state change is announced politely, and is not an alert.
      await expect(polite(page)).toHaveText("This round matches its evidence");
      await expect(alert(page)).toBeEmpty();
    });

    test("a refused submit keeps the focus in the field, whose error is tied to it and announced", async ({
      page,
      verifyPage,
    }) => {
      await verifyPage.open(page);
      await expect(h1(page)).toContainText("Verify a round");
      const field = page.getByLabel("Round id");
      await page.keyboard.press("Tab");
      await page.keyboard.type("not a round id");
      await page.keyboard.press("Enter");
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      expect(await describedText(field)).toContain("This is not a round id.");
      // The polite region carries the error, as the field state's announcement.
      await expect(polite(page)).toHaveText("This is not a round id.");
    });

    test("the retry is used by keyboard alone, and focus moves to the new heading", async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      fakeVerifyApi.answer(VERIFY_ROUND_ID, { kind: "error", status: 500 });
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: matchingRound(),
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText(
        "The verification service could not answer",
      );
      // A failure is an alert, and the polite region stays quiet.
      await expect(alert(page)).toContainText(
        "The verification service answered with an error",
      );
      await expect(polite(page)).toBeEmpty();
      // Nothing moved the focus on its own.
      await expect(h1(page)).not.toBeFocused();
      const retry = page.getByRole("button", { name: "Try again" });
      await page.keyboard.press("Tab");
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(h1(page)).toContainText("This round matches its evidence");
      await expect(h1(page)).toBeFocused();
      await expect(alert(page)).toBeEmpty();
    });
  });

  test.describe("200 % zoom", () => {
    test("the form is reachable with no horizontal scroll", async ({
      page,
      verifyPage,
    }) => {
      await page.setViewportSize({ width: 640, height: 360 });
      await verifyPage.open(page);
      const submit = page.getByRole("button", { name: "Verify", exact: true });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await expect(page.getByLabel("Round id")).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test("a recomputed round, with its full hashes, wraps with no horizontal scroll", async ({
      page,
      fakeVerifyApi,
      verifyPage,
    }) => {
      await page.setViewportSize({ width: 640, height: 360 });
      fakeVerifyApi.answerEvery(VERIFY_ROUND_ID, {
        kind: "round",
        body: matchingRound(),
      });
      await verifyPage.open(page, VERIFY_ROUND_ID);
      await expect(h1(page)).toContainText("This round matches its evidence");
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  });
});
