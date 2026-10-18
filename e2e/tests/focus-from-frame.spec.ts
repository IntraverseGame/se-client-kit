// Why the Wrapper blurs a focused game frame before it focuses its result or
// error heading (W-46), per project (harness/frame-focus.ts): a page whose
// frame, on another site as the game is the Wrapper's (W-37), has the focus
// calls `focus()` on its own heading. Where plain `focus()` sends the focus is
// `FOCUS_FROM_FRAME`: it stays in the frame in Playwright's Firefox. The second
// test is what the Wrapper relies on: with the frame element blurred first,
// the heading takes the focus in every project. The first outcome is printed
// as one line on stdout.

import type { Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { FOCUS_FROM_FRAME } from "./harness/frame-focus.ts";
import { GAME_ORIGIN, PAGES_ORIGIN } from "./harness/origins.ts";

const PARENT = `${PAGES_ORIGIN}/focus-from-frame.html`;
const FRAME = `${GAME_ORIGIN}/focus-from-frame.html`;

/** The Wrapper's shape: a heading only a script focuses, and the frame. */
const PARENT_HTML = `<!doctype html>
<html lang="en"><head><title>Parent</title></head><body>
<h1 tabindex="-1">Result</h1>
<iframe title="Frame" sandbox="allow-scripts allow-same-origin" src="${FRAME}"></iframe>
</body></html>`;

const FRAME_HTML = `<!doctype html>
<html lang="en"><head><title>Frame</title></head><body>
<button type="button">Tails</button>
</body></html>`;

/** Opens the parent and tabs into the frame's button. */
const focusInFrame = async (page: Page): Promise<void> => {
  const context = page.context();
  await context.route(PARENT, route =>
    route.fulfill({ contentType: "text/html", body: PARENT_HTML }),
  );
  await context.route(FRAME, route =>
    route.fulfill({ contentType: "text/html", body: FRAME_HTML }),
  );
  await page.goto(PARENT);
  await expect(page.frameLocator("iframe").getByRole("button")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.frameLocator("iframe").getByRole("button")).toBeFocused();
};

/** The parent focuses its heading, the frame element blurred first or not. */
const focusHeading = (page: Page, blurFirst: boolean): Promise<string> =>
  page.evaluate(blur => {
    const heading = document.querySelector("h1");
    if (blur && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    heading?.focus();
    return document.activeElement === heading
      ? "moves to the element"
      : document.activeElement instanceof HTMLIFrameElement
        ? "stays in the frame"
        : `elsewhere: ${document.activeElement?.tagName ?? "none"}`;
  }, blurFirst);

test.describe("the focus out of a focused frame (W-46)", () => {
  test("a parent's focus() while its frame has the focus, per project", async ({
    page,
    browserName,
  }) => {
    await focusInFrame(page);
    const outcome = await focusHeading(page, false);
    // One plain line on stdout, so the CI log shows it: the outcome only.
    console.log(`focus-from-frame ${browserName}: ${outcome}`);
    expect(outcome).toBe(FOCUS_FROM_FRAME[browserName]);
  });

  test("blurred first, as the Wrapper does: the heading takes it in every project", async ({
    page,
  }) => {
    await focusInFrame(page);
    expect(await focusHeading(page, true)).toBe("moves to the element");
    await expect(page.locator("h1")).toBeFocused();
  });
});
