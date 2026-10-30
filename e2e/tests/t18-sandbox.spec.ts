// T-18 (W-37, W-38): the sandbox. A malicious test game, served at D in place
// of the reference game (pages/malicious-game.html) and mounted by the
// Wrapper's release bundle at the redeem answer's D, tries to read the parent's
// document, storage, and location, and posts forged messages at an idle round.
// Every read throws a SecurityError. Of the forged messages, only the plain
// pick is answered, `reject` `not_active`, and no round call is sent; a pick
// with an extra field, a message of an unknown type, and the game's own
// Snapshot get no answer at all. A last probe, answered `invalid`, marks the
// end of the bridge's answers, so a late answer is caught without a sleep.
// Nothing the game receives, nor anything else the scan reads, holds the
// launch code, the play token, or the key. A forged pick in a round the game
// could move in needs a round that passes W-26, which the vectors cannot
// issue yet (and the frame stays hidden at `active` until then).

import { readFile } from "node:fs/promises";

import type { Frame, Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures.ts";
import { GAME_ORIGIN, TEST_PAGES, WRAPPER_ORIGIN } from "./harness/origins.ts";
import {
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

type Attempt =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

type GameRecord = {
  readonly attempts: Readonly<Partial<Record<string, Attempt>>>;
  readonly received: readonly {
    readonly origin: string;
    readonly data: unknown;
  }[];
};

const READS = [
  "parent.document",
  "parent.localStorage",
  "parent.sessionStorage",
  "parent.location.href",
  "top.document.cookie",
  "parent.indexedDB",
] as const;

/** The game frame, once the malicious game has made every attempt. */
const gameFrame = async (page: Page): Promise<Frame> => {
  await expect
    .poll(() =>
      page.frames().some(frame => frame.url().startsWith(`${GAME_ORIGIN}/`)),
    )
    .toBe(true);
  const frame = page
    .frames()
    .find(candidate => candidate.url().startsWith(`${GAME_ORIGIN}/`));
  if (frame === undefined) throw new Error("the game frame is gone");
  await expect
    .poll(() =>
      frame.evaluate(
        () =>
          (globalThis as { attempts?: { done?: unknown } }).attempts?.done !==
          undefined,
      ),
    )
    .toBe(true);
  return frame;
};

type Reject = { readonly id: unknown; readonly reason: unknown };

/** The `reject` answers the game received, in order, as `{ id, reason }`. */
const rejectsOf = (record: GameRecord): readonly Reject[] =>
  record.received
    .map(message => message.data as Partial<Reject> & { type?: unknown })
    .filter(data => data.type === "reject")
    .map(data => ({ id: data.id, reason: data.reason }));

const recordOf = (frame: Frame): Promise<GameRecord> =>
  frame.evaluate(() => {
    const view = globalThis as unknown as GameRecord;
    return { attempts: view.attempts, received: view.received };
  });

test.describe("T-18: the sandbox", () => {
  test("a malicious game gets nothing: no parent read, no move, no secret", async ({
    page,
    context,
    fakePlayApi,
    secretScan,
  }) => {
    // Registered after the fixtures' routes, so it takes D's requests.
    const html = await readFile(`${TEST_PAGES}malicious-game.html`);
    await context.route(`${GAME_ORIGIN}/**`, route =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: html,
      }),
    );
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi, secretScan);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    // The single screen: the malicious game is visible and inert at idle;
    // `inert` stops none of its scripts, so its reads and forged messages are
    // tried as before (W-57, W-58).
    await expect(page.locator("iframe")).toBeVisible();
    await expect(page.locator("iframe")).toHaveAttribute("inert", "");

    const frame = await gameFrame(page);
    // The probe was posted last and is answered at once: once its answer is
    // in, every answer to the messages before it is too (bounded by the
    // poll's timeout).
    await expect
      .poll(async () => rejectsOf(await recordOf(frame)).map(r => r.id))
      .toContain("probe");
    const record = await recordOf(frame);
    expect(rejectsOf(record)).toEqual([
      { id: "forged-1", reason: "not_active" },
      { id: "probe", reason: "invalid" },
    ]);

    for (const name of READS) {
      expect(record.attempts[name], name).toEqual({
        ok: false,
        error: "SecurityError",
      });
    }
    // Everything the game received came from the Wrapper's own origin, and is
    // a Snapshot copy or an answer to its own requests.
    for (const message of record.received) {
      expect(message.origin).toBe(WRAPPER_ORIGIN);
      expect(["snapshot", "reject"]).toContain(
        (message.data as { readonly type?: unknown }).type,
      );
    }
    expect(servedFor(fakePlayApi, "startRound")).toEqual([]);
    expect(servedFor(fakePlayApi, "continueRound")).toEqual([]);
    expect(servedFor(fakePlayApi, "cashOutRound")).toEqual([]);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    // The game wrote what it received into its page: the scan reads it too.
    await secretScan.expectClean();
  });
});
