// The first-pick read of the Cash or Crash spec (RFC-002): every read is bounded.
// An absent status heading is "waiting", at once, instead of a wait until the
// test's timeout (`textContent()` on a missing element waits that long).

import { expect, test } from "../harness/worker-browser.ts";
import { firstPickState } from "../preview-support/preview-rounds.ts";

test.describe("the first pick's state", () => {
  test("is waiting, at once, when there is no status heading", async ({
    page,
  }) => {
    await page.setContent("<main><p>nothing yet</p></main>");
    const started = Date.now();
    expect(await firstPickState(page)).toBe("waiting");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test("is waiting while the round is active with no cash-out", async ({
    page,
  }) => {
    await page.setContent(
      '<section class="se-status"><h1>Your round is in play</h1></section>',
    );
    expect(await firstPickState(page)).toBe("waiting");
  });

  test("is survived when the cash-out is offered", async ({ page }) => {
    await page.setContent(
      '<section class="se-status"><h1>Your round is in play</h1></section><button>Cash out</button>',
    );
    expect(await firstPickState(page)).toBe("survived");
  });

  test("is lost when the heading says the round was lost", async ({ page }) => {
    await page.setContent(
      '<section class="se-status"><h1>You lost</h1></section>',
    );
    expect(await firstPickState(page)).toBe("lost");
  });
});
