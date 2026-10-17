// A smoke run of the reference game's build (`apps/reference-game/dist`,
// unmodified) in a real browser, at its own origin, in the sandboxed frame of a
// stand-in host page (pages/game-host.html), not the Wrapper. It proves the
// game's side of `se.controller/1` across a real origin boundary: the `hello`
// reaches the host at its origin, a Snapshot from the host renders, a click
// asks for a pick, a reject shows in the alert, a message the game posts to
// itself is ignored, and the page passes the audit. The fixtures serve the game
// at D for every test (serve-origins.ts). A whole round through the Wrapper is
// T-10 and T-11 (pending.spec.ts): the Wrapper mounts the game at the redeem
// answer's D (W-37), but a round W-26 passes is still needed.

import type { Frame, Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import { expect, test } from "./harness/fixtures.ts";
import { frameNamed } from "./harness/frames.ts";
import { GAME_ORIGIN, PAGES_ORIGIN } from "./harness/origins.ts";

type Received = {
  readonly origin: string;
  readonly fromGame: boolean;
  readonly data: unknown;
};

const SCHEMA = "se.controller/1";

/** The game's copy of a Coin Flip Snapshot, as the bridge builds it. */
const coinFlip = (
  version: number,
  status: string,
  step: Readonly<Record<string, number>> = {},
): Readonly<Record<string, unknown>> => ({
  version,
  presentation: "steps",
  status,
  roundId: "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d",
  step: status === "won" ? 1 : 0,
  context: { language: "en", device: "desktop", theme: {} },
  config: {
    kind: "steps",
    steps: [{ index: 0, optionCount: 2, multiplier: 1.94, ...step }],
  },
});

const received = (page: Page): Promise<readonly Received[]> =>
  page.evaluate(
    () => (window as unknown as { received: readonly Received[] }).received,
  );

/** Posts `message` from the host page to the game frame, at the game origin. */
const postToGame = async (page: Page, message: unknown): Promise<void> => {
  await page.evaluate(
    ([data, origin]) => {
      document
        .querySelector("iframe")
        ?.contentWindow?.postMessage(data, origin);
    },
    [message, GAME_ORIGIN] as const,
  );
};

const openHost = async (page: Page): Promise<Frame> => {
  await page.goto(`${PAGES_ORIGIN}/game-host.html`);
  const game = await frameNamed(page, "game");
  await expect
    .poll(async () => (await received(page)).length)
    .toBeGreaterThan(0);
  return game;
};

test.describe("the reference game", () => {
  test("says hello to its parent's origin, from its own origin", async ({
    page,
  }) => {
    await openHost(page);
    expect(await received(page)).toEqual([
      {
        origin: GAME_ORIGIN,
        fromGame: true,
        data: {
          schema: SCHEMA,
          type: "hello",
          presentations: ["steps"],
          statuses: [
            "idle",
            "starting",
            "active",
            "resolving",
            "won",
            "lost",
            "canceled",
          ],
        },
      },
    ]);
  });

  test("renders a Snapshot, asks for a pick, and shows a reject and the result", async ({
    page,
  }) => {
    const game = await openHost(page);
    await postToGame(page, {
      schema: SCHEMA,
      type: "snapshot",
      snapshot: coinFlip(3, "active"),
    });
    const heading = game.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Call it: heads or tails");

    await game.getByRole("button", { name: "Heads" }).click();
    await expect
      .poll(async () => (await received(page)).at(-1)?.data)
      .toEqual({
        schema: SCHEMA,
        type: "action",
        id: "pick-1",
        verb: "pick",
        args: { step: 0, option: 0 },
      });

    await postToGame(page, {
      schema: SCHEMA,
      type: "reject",
      id: "pick-1",
      reason: "busy",
    });
    await expect(game.getByRole("alert")).toHaveText(
      "Your last call is still on its way. Wait a moment, then try again.",
    );

    await game.getByRole("button", { name: "Tails" }).click();
    await postToGame(page, {
      schema: SCHEMA,
      type: "snapshot",
      snapshot: coinFlip(5, "won", { selectedIndex: 1, losingIndex: 0 }),
    });
    await expect(heading).toHaveText("You won");
    await expect(heading).toBeFocused();
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("ignores a Snapshot that does not come from its parent, and a message outside the schema", async ({
    page,
  }) => {
    const game = await openHost(page);
    await game.evaluate(
      snapshot => {
        window.postMessage(
          { schema: "se.controller/1", type: "snapshot", snapshot },
          "*",
        );
      },
      coinFlip(3, "active"),
    );
    await postToGame(page, { schema: SCHEMA, type: "resize", height: 1 });
    // A lower version than the ignored one: had the game taken the Snapshot it
    // posted to itself, it would ignore this one and stay on that round.
    await postToGame(page, {
      schema: SCHEMA,
      type: "snapshot",
      snapshot: coinFlip(1, "idle"),
    });
    await expect(game.getByRole("heading", { level: 1 })).toHaveText(
      "Ready to flip",
    );
  });

  test("talks to nobody when it is not framed", async ({ page }) => {
    await page.goto(`${GAME_ORIGIN}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Coin Flip runs inside the SuperEngine Wrapper",
    );
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
