// T-33's browser row (W-38, W-57, RFC-005 section 1): the reference game
// declares the `inset` capability. Embedded in a 1280 by 720 box, the
// Wrapper's bar floats, the game's frame is the whole stage with the bar over
// its bottom, and the game, told the band (`layout`), keeps its whole
// interface above it: its page's `data-inset` is the band, and its content
// ends above the bar. In an 800 by 600 box the bar docks under the stage and
// the band drops to 0. Every browser project.

import type { Frame, Page } from "@playwright/test";

import { roundEnvironmentConfig } from "./harness/environment-config.ts";
import { embedWrapper, serveListing } from "./harness/operator-page.ts";
import { expect, scriptRound, test } from "./harness/round-play.ts";
import { ROUND_PINS } from "./harness/round-vector.ts";
import { TEXT, WRAPPER_PAGE } from "./harness/wrapper-page.ts";

type Boxes = {
  readonly main: string | undefined;
  readonly frame: string | undefined;
  readonly stage: readonly number[];
  readonly game: readonly number[];
  readonly bar: readonly number[];
};

/** The Wrapper's layout, read inside its frame. */
const boxesOf = (): Boxes => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page: `frame.evaluate` serializes only `boxesOf`
  const box = (selector: string): readonly number[] => {
    const rect =
      document.querySelector(selector)?.getBoundingClientRect() ??
      new DOMRect();
    return [rect.top, rect.bottom, rect.left, rect.right].map(value =>
      Math.round(value),
    );
  };
  return {
    main: document.querySelector<HTMLElement>(".se-main")?.dataset["bar"],
    frame: document.querySelector<HTMLElement>(".se-stage")?.dataset["frame"],
    stage: box(".se-stage"),
    game: box(".se-game iframe"),
    bar: box(".se-bar"),
  };
};

type GameLayout = {
  readonly inset: string | undefined;
  readonly viewport: number;
  /** The bottom of the game's own interface. */
  readonly bottom: number;
};

/** The game's page, read inside the game's frame. */
const gameLayoutOf = (): GameLayout => ({
  inset: document.documentElement.dataset["inset"],
  viewport: document.documentElement.clientHeight,
  bottom: Math.round(
    document.querySelector(".rg-game")?.getBoundingClientRect().bottom ?? 0,
  ),
});

/** The game's frame inside the Wrapper's. */
const gameOf = (wrapper: Frame): Frame => {
  const [game] = wrapper.childFrames();
  if (game === undefined) throw new Error("no game frame");
  return game;
};

const embedded = async (
  page: Page,
  launchUrl: string,
  box: { readonly width: number; readonly height: number },
): Promise<Frame> => {
  const frame = await embedWrapper(page, launchUrl, { box });
  await expect(frame.locator(".se-status h1")).toHaveText(TEXT.idle);
  await expect(frame.locator('.se-stage[data-frame="inset"]')).toHaveCount(1);
  return frame;
};

test.beforeEach(async ({ context, playApiBaseUrl }) => {
  await serveListing(
    context,
    roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
  );
});

test("a wide box: the frame is the whole stage, the bar floats over it, and the game's interface stays above the band", async ({
  page,
  fakePlayApi,
}) => {
  scriptRound(fakePlayApi);
  const frame = await embedded(page, fakePlayApi.launchUrl(WRAPPER_PAGE), {
    width: 1280,
    height: 720,
  });
  const boxes = await frame.evaluate(boxesOf);
  expect(boxes.main).toBe("float");
  expect(boxes.frame).toBe("inset");
  // The frame is the whole stage, bar included.
  expect(boxes.game).toEqual(boxes.stage);
  const [gameTop = 0, gameBottom = 0] = boxes.game;
  const [barTop = 0, barBottom = 0] = boxes.bar;
  // The bar floats over the frame's bottom.
  expect(barTop).toBeGreaterThan(gameTop);
  expect(barBottom).toBeLessThan(gameBottom);
  const band = gameBottom - barTop;
  const game = gameOf(frame);
  await expect
    .poll(async () => (await game.evaluate(gameLayoutOf)).inset)
    .toBeDefined();
  const layout = await game.evaluate(gameLayoutOf);
  // The band the game was told is the one the bar covers.
  expect(Math.abs(Number(layout.inset) - band)).toBeLessThanOrEqual(1);
  // The game's interface ends above it.
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewport - band);
});

test("a narrower box: the bar docks under the stage and the band drops to 0", async ({
  page,
  fakePlayApi,
}) => {
  scriptRound(fakePlayApi);
  const frame = await embedded(page, fakePlayApi.launchUrl(WRAPPER_PAGE), {
    width: 800,
    height: 600,
  });
  const boxes = await frame.evaluate(boxesOf);
  expect(boxes.main).toBe("dock");
  const [, gameBottom = 0] = boxes.game;
  const [barTop = 0] = boxes.bar;
  expect(barTop).toBeGreaterThanOrEqual(gameBottom);
  const game = gameOf(frame);
  await expect
    .poll(async () => (await game.evaluate(gameLayoutOf)).inset)
    .toBe("0");
});
