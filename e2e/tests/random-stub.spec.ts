// The seeded random source's own tests: the seed decides the bytes, the stub
// reaches a child frame and survives a reload, the reported draw is what the
// page received, and the platform's own errors still fire (and report nothing).

import type { Browser, Frame } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { frameNamed } from "./harness/frames.ts";
import { guardNetwork } from "./harness/hermetic.ts";
import { PAGES_ORIGIN, TEST_PAGES } from "./harness/origins.ts";
import { stubRandomValues } from "./harness/random-stub.ts";
import { serveDirectory } from "./harness/static-origin.ts";

const draw = (frame: Frame, length: number): Promise<readonly number[]> =>
  frame.evaluate(
    size => Array.from(crypto.getRandomValues(new Uint8Array(size))),
    length,
  );

/** The first 16 bytes a fresh, hermetic context draws with `seed`. */
const firstDraw = async (
  browser: Browser,
  seed: number,
): Promise<readonly number[]> => {
  const context = await browser.newContext();
  try {
    await guardNetwork(context);
    await serveDirectory(context, PAGES_ORIGIN, TEST_PAGES);
    await stubRandomValues(context, seed);
    const page = await context.newPage();
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    return await draw(page.mainFrame(), 16);
  } finally {
    await context.close();
  }
};

const errorOf = (frame: Frame, kind: "float" | "quota"): Promise<string> =>
  frame.evaluate(which => {
    try {
      crypto.getRandomValues(
        which === "quota"
          ? new Uint8Array(65_537)
          : (new Float32Array(4) as never),
      );
      return "no error";
    } catch (error: unknown) {
      return error instanceof Error ? error.name : "not an Error";
    }
  }, kind);

test("the same seed draws the same bytes, another seed others", async ({
  browser,
}) => {
  const [first, again, other] = [
    await firstDraw(browser, 7),
    await firstDraw(browser, 7),
    await firstDraw(browser, 8),
  ];
  expect(again).toEqual(first);
  expect(other).not.toEqual(first);
});

test("reports exactly the bytes the page received", async ({
  page,
  randomDraws,
}) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
  const received = await draw(page.mainFrame(), 32);
  await randomDraws.settled();
  expect(randomDraws.draws().map(bytes => Array.from(bytes))).toEqual([
    received,
  ]);
});

test("reaches a child frame and survives a reload", async ({
  page,
  randomDraws,
}) => {
  await page.goto(`${PAGES_ORIGIN}/framed.html`);
  const inChild = await draw(await frameNamed(page, "child"), 8);
  const beforeReload = await draw(page.mainFrame(), 8);
  await page.reload();
  // Each document starts the stream from the seed again.
  const afterReload = await draw(page.mainFrame(), 8);
  expect(afterReload).toEqual(beforeReload);
  await randomDraws.settled();
  expect(randomDraws.draws().map(bytes => Array.from(bytes))).toEqual([
    inChild,
    beforeReload,
    afterReload,
  ]);
});

test("keeps the platform's own errors, and reports nothing for them", async ({
  page,
  randomDraws,
}) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
  expect(await errorOf(page.mainFrame(), "quota")).toBe("QuotaExceededError");
  expect(await errorOf(page.mainFrame(), "float")).toBe("TypeMismatchError");
  await randomDraws.settled();
  expect(randomDraws.draws()).toEqual([]);
});
