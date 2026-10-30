// T-27 (W-57 "The height", W-49d, ADR-010): the Wrapper fills its operator's
// box. In boxes of 1280 by 720, 800 by 600, and 400 by 900 CSS pixels its
// document is exactly the box, with no scroll bar, in every state of a round
// to a win, a loss, and a typed error, and the stage's box never moves between
// states. Below `H_min` its document scrolls inside the iframe, with the bar
// sticky only while it takes at most half the viewport, and the scroll bar
// does not change the content's width or send a `resize`. A long alert sits
// in the status slot, under the status line, scrolls inside the bar, never
// covers the stage, and leaves the bar's height as it was. At 200 % zoom (a 640 by
// 360 box) every control stays usable. Runs in every browser project.

import type { Frame, Page } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import {
  embedWrapper,
  operatorReceived,
  serveListing,
} from "./harness/operator-page.ts";
import {
  advanceUntil,
  expect,
  scriptRound,
  test,
} from "./harness/round-play.ts";
import { pickCheck, ROUND_PINS } from "./harness/round-vector.ts";
import { TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

type Box = { readonly width: number; readonly height: number };

const BOXES: readonly Box[] = [
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
  { width: 400, height: 900 },
];

type Layout = {
  /** The document scrolls that way: a scroll moved it. */
  readonly scrollsX: boolean;
  readonly scrollsY: boolean;
  readonly clientHeight: number;
  /** The content's width, the scroll bar's gutter left out. */
  readonly clientWidth: number;
  readonly stage: readonly number[];
  readonly bar: number;
  readonly sticky: boolean;
};

/**
 * The Wrapper's document and its stage, measured inside its iframe. Whether it
 * scrolls is tried, not read from `scrollWidth`, which counts the gutter that
 * `scrollbar-gutter: stable` keeps.
 */
const measure = (): Layout => {
  const root = document.documentElement;
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `measure`
  const rect = (selector: string): DOMRect =>
    document.querySelector(selector)?.getBoundingClientRect() ?? new DOMRect();
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `measure`
  const scrolls = (left: number, top: number): boolean => {
    globalThis.scrollTo(left, top);
    const moved = globalThis.scrollX > 0 || globalThis.scrollY > 0;
    globalThis.scrollTo(0, 0);
    return moved;
  };
  const stage = rect(".se-stage");
  return {
    scrollsX: scrolls(50, 0),
    scrollsY: scrolls(0, 50),
    clientHeight: root.clientHeight,
    clientWidth: root.clientWidth,
    stage: [stage.x, stage.y, stage.width, stage.height],
    bar: rect(".se-bar").height,
    sticky:
      document.querySelector<HTMLElement>(".se-bar")?.dataset["sticky"] !==
      undefined,
  };
};

const layoutOf = (frame: Frame): Promise<Layout> => frame.evaluate(measure);

/** The document is the box exactly: nothing scrolls either way. */
const expectFills = (layout: Layout): void => {
  expect(layout.scrollsY).toBe(false);
  expect(layout.scrollsX).toBe(false);
};

/**
 * The alert sits in the status slot (the alert overlays the status, W-57),
 * under the status line: below the stage, inside the bar, and the slot scrolls
 * when its text does not fit.
 */
const alertInBar = (element: Element): boolean => {
  const slot = element.parentElement;
  const stage = document.querySelector(".se-stage")?.getBoundingClientRect();
  const bar = document.querySelector(".se-bar")?.getBoundingClientRect();
  if (slot?.classList.contains("se-status-slot") !== true) return false;
  const own = slot.getBoundingClientRect();
  return (
    stage !== undefined &&
    bar !== undefined &&
    element.previousElementSibling?.classList.contains("se-status") === true &&
    own.top >= stage.bottom &&
    own.bottom <= bar.bottom + 0.5 &&
    (slot.scrollHeight <= slot.clientHeight ||
      slot.getAttribute("tabindex") === "0")
  );
};

/** The `resize` heights the operator page received, in order. */
const resizesOf = async (page: Page): Promise<number[]> =>
  (await operatorReceived(page))
    .filter(message => (message as { type?: unknown }).type === "resize")
    .map(message => (message as { height: number }).height);

/** The operator page sets the box's height, ignoring the minimum. */
const shrinkBox = (height: number): void => {
  const box = document.querySelector<HTMLIFrameElement>(
    'iframe[name="wrapper"]',
  );
  box?.style.setProperty("min-height", "0");
  box?.style.setProperty("height", `${String(height)}px`);
};

const heading = (frame: Frame): ReturnType<Frame["locator"]> =>
  frame.locator(".se-status h1");

/** The operator page with the Wrapper in `box`, at `idle`. */
const embedded = async (
  page: Page,
  fake: Parameters<typeof scriptRound>[0],
  box: Box,
): Promise<Frame> => {
  const frame = await embedWrapper(page, fake.launchUrl(WRAPPER_PAGE), {
    box,
  });
  await expect(heading(frame)).toHaveText(TEXT.idle);
  return frame;
};

/** Starts the round and waits until it is playable (W-57, W-58). */
const toPlayable = async (page: Page, frame: Frame): Promise<void> => {
  await frame.getByRole("button", { name: TEXT.placeBet }).click();
  const game = frame.locator("iframe:not([inert])");
  await advanceUntil(page, () => game.isVisible());
  await expect(heading(frame)).toHaveText(TEXT.active);
};

const tails = (frame: Frame) =>
  frame.frameLocator("iframe").getByRole("button", { name: "Tails" });

test.beforeEach(async ({ context, playApiBaseUrl }) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
});

for (const box of BOXES) {
  const size = `${String(box.width)} by ${String(box.height)}`;
  for (const [ending, vector, shown] of [
    ["a win", "coinflip-won-payout", TEXT.won],
    ["a loss", "coinflip-lost", TEXT.lost],
  ] as const) {
    test(`fills a ${size} box in every state of a round to ${ending}, the stage in place`, async ({
      page,
      fakePlayApi,
    }) => {
      scriptRound(fakePlayApi);
      const frame = await embedded(page, fakePlayApi, box);
      const idle = await layoutOf(frame);
      expectFills(idle);
      await toPlayable(page, frame);
      const active = await layoutOf(frame);
      expectFills(active);
      fakePlayApi.answer("continueRound", {
        kind: "snapshot",
        vector,
        expect: pickCheck,
      });
      await tails(frame).click();
      await expect(heading(frame)).toHaveText(shown);
      const result = await layoutOf(frame);
      expectFills(result);
      expect(active.stage).toEqual(idle.stage);
      expect(result.stage).toEqual(idle.stage);
      expect(result.bar).toBe(idle.bar);
    });
  }

  test(`fills a ${size} box with a typed error, and a long alert scrolls inside the bar`, async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    // Retryable: the start's resends get it too (W-22, W-43).
    fakePlayApi.answerEvery("startRound", {
      kind: "problem",
      vector: "problem-default-code-unavailable",
    });
    const frame = await embedded(page, fakePlayApi, box);
    const before = await layoutOf(frame);
    await frame.getByRole("button", { name: TEXT.placeBet }).click();
    const alert = frame.locator(".se-alert");
    await expect(alert).toContainText(TEXT.error);
    const after = await layoutOf(frame);
    expectFills(after);
    expect(after.stage).toEqual(before.stage);
    expect(after.bar).toBe(before.bar);
    // The alert stays in the status slot: below the stage, inside the bar.
    const inBar = await alert.evaluate(alertInBar);
    expect(inBar).toBe(true);
  });
}

test("below H_min the document scrolls, the stage keeps its minimum, and the scroll bar sends nothing", async ({
  page,
  fakePlayApi,
}) => {
  scriptRound(fakePlayApi);
  const frame = await embedded(page, fakePlayApi, { width: 1280, height: 720 });
  const roomy = await layoutOf(frame);
  const resizes = (): Promise<number[]> => resizesOf(page);
  await expect.poll(async () => (await resizes()).length).toBe(1);
  const [minimum = 0] = await resizes();
  expect(minimum).toBeGreaterThanOrEqual(Math.ceil(roomy.bar) + 270);
  // The operator page shrinks the box under the minimum, ignoring it.
  await page.evaluate(shrinkBox, minimum - 40);
  await expect
    .poll(async () => (await layoutOf(frame)).clientHeight)
    .toBe(minimum - 40);
  const tight = await layoutOf(frame);
  expect(tight.scrollsY).toBe(true);
  expect(tight.scrollsX).toBe(false);
  expect(tight.stage[3]).toBe(270);
  // The scroll bar's gutter is kept: the content's width does not change.
  expect(tight.clientWidth).toBe(roomy.clientWidth);
  // Sticky only while the bar takes at most half the viewport.
  await expect
    .poll(async () => {
      const now = await layoutOf(frame);
      return now.sticky === now.bar <= now.clientHeight / 2;
    })
    .toBe(true);
  // The money control stays reachable.
  await toPlayable(page, frame);
  expect(await resizes()).toEqual([minimum]);
});

test("at 200 % zoom (a 640 by 360 box) every control stays usable", async ({
  page,
  fakePlayApi,
}) => {
  scriptRound(fakePlayApi);
  const frame = await embedded(page, fakePlayApi, { width: 640, height: 360 });
  const layout = await layoutOf(frame);
  expect(layout.scrollsX).toBe(false);
  await toPlayable(page, frame);
  fakePlayApi.answer("continueRound", {
    kind: "snapshot",
    vector: "coinflip-won-payout",
    expect: pickCheck,
  });
  await tails(frame).click();
  await expect(heading(frame)).toHaveText(TEXT.won);
  await expect(
    frame.getByRole("button", { name: TEXT.playAgain }),
  ).toBeEnabled();
});
