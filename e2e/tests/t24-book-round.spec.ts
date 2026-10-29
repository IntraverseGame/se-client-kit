// T-24 (#146, W-50 to W-56, W-39): a book round, in the Wrapper's release
// bundle against the fake Play API, on the backend's book vectors of one round
// (`valid/book-lifecycle-*`), played twice: once to `won`, once to `lost`. The
// session opens on the idle book Snapshot with its RTP line (`config.rtp`), the
// player starts a round, the fake checks the start's `actionKey` (the session's
// scripted key) and bet, the start answers `starting` (the bet reserved, no
// proofs), a read gives `starting` with the bound `randomnessProof`, and the
// next read closes the round to its ending in one step, with no status
// between. The reference game plays the draw back from its `playback` copy; the
// Wrapper shows the result, the payout as its `formatted` when it is above 0
// (W-54), the round id, and the verify link (W-39); nothing is ever sent to
// `rounds:continue`, `rounds:cashOut`, or `rounds:cancel` (W-51); the result
// passes the accessibility audit. A start answered 401 `SESSION_REVOKED` (the
// operator's wallet refused the session) ends the session with nothing more
// sent (W-42, W-44).

import type { Locator, Page } from "@playwright/test";

import { auditAccessibility } from "./harness/accessibility.ts";
import type { BodyCheck } from "./harness/fake-play-wire.ts";
import {
  advanceUntil,
  expect,
  gameFrame,
  shows,
  snapshotAnswer,
  test,
} from "./harness/round-play.ts";
import { ROUND, startCheck } from "./harness/round-vector.ts";
import { validVector } from "./harness/vectors.ts";
import {
  launch,
  servedFor,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

const IDLE = "book-lifecycle-idle";
const FUNDED = "book-lifecycle-starting-funded";
const BOUND = "book-lifecycle-starting-bound";
const LOST = "book-lifecycle-lost";
const WON = "book-lifecycle-won";

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordAt = (parent: Json, key: string, where: string): Json => {
  const value = parent[key];
  if (!isRecord(value)) throw new TypeError(`${where}: no ${key}`);
  return value;
};

const textAt = (parent: Json, key: string, where: string): string => {
  const value = parent[key];
  if (typeof value !== "string") throw new TypeError(`${where}: no ${key}`);
  return value;
};

const inputOf = (vector: string): Json => {
  const { input } = validVector(vector, "Snapshot");
  if (!isRecord(input)) throw new TypeError(`${vector}: no input`);
  return input;
};

/** What the test reads of the backend's book round, at run time. */
const BOOK = (() => {
  const idle = inputOf(IDLE);
  const bet = recordAt(recordAt(idle, "bet", IDLE), "defaultBet", IDLE);
  return {
    rtpDecimal: textAt(
      recordAt(recordAt(idle, "config", IDLE), "rtp", IDLE),
      "decimal",
      IDLE,
    ),
    bet: { value: textAt(bet, "value", IDLE), unit: textAt(bet, "unit", IDLE) },
  } as const;
})();

/** What the test reads of one ending of the round: its result and draw. */
type Ending = {
  readonly vector: string;
  readonly heading: string;
  readonly roundId: string;
  readonly payoutValue: string;
  readonly payoutFormatted: string;
  readonly drawIndex: number;
  readonly eventTypes: readonly string[];
};

const endingOf = (vector: string, heading: string): Ending => {
  const input = inputOf(vector);
  const payout = recordAt(input, "payout", vector);
  const draw = recordAt(recordAt(input, "config", vector), "draw", vector);
  const events = draw["events"];
  if (!Array.isArray(events)) throw new TypeError(`${vector}: no events`);
  return {
    vector,
    heading,
    roundId: textAt(input, "roundId", vector),
    payoutValue: textAt(payout, "value", vector),
    payoutFormatted: textAt(payout, "formatted", vector),
    drawIndex: Number(draw["index"]),
    eventTypes: events.map((event: unknown) =>
      isRecord(event)
        ? `${String(event["index"])}. ${String(event["type"])}`
        : "",
    ),
  };
};

const ENDINGS: readonly Ending[] = [
  endingOf(WON, TEXT.won),
  endingOf(LOST, TEXT.lost),
];

/** "0.9600" as the Wrapper shows it (W-56): by string operations only. */
const rtpLine = (decimal: string): string => {
  const [whole = "", fraction = ""] = decimal.split(".");
  const percent = `${whole}${fraction.slice(0, 2)}`.replace(/^0+(?=\d)/u, "");
  return `Return to player: ${percent}.${fraction.slice(2)}%`;
};

/**
 * The start carries the session's key (the scripted one) and the idle
 * Snapshot's default bet, copied from its own `Amount` fields (W-51).
 */
const bookStartCheck: BodyCheck = body => {
  const key = startCheck(body);
  if (key !== undefined) return key;
  const bet = isRecord(body) ? body["bet"] : undefined;
  return isRecord(bet) &&
    bet["value"] === BOOK.bet.value &&
    bet["unit"] === BOOK.bet.unit
    ? undefined
    : "the start's bet is not the idle Snapshot's default bet";
};

/**
 * Records every text the status heading shows from now on, so the test can see
 * that nothing came between `starting` and the result.
 */
const recordHeadings = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seHeadings: string[] }).seHeadings = seen;
    const note = (): void => {
      const text = document.querySelector(".se-status h1")?.textContent ?? "";
      if (seen.at(-1) !== text) seen.push(text);
    };
    note();
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
};

const headingsSeen = (page: Page): Promise<readonly string[]> =>
  page.evaluate(
    () => (window as unknown as { seHeadings: string[] }).seHeadings,
  );

/** Whether the payout line is shown: only for a payout above 0 (W-54). */
const showsPayout = (ending: Ending): boolean =>
  BigInt(ending.payoutValue) > 0n;

/**
 * The status section shows the payout as its `formatted` for a payout above 0,
 * and no payout line otherwise (W-54).
 */
const expectPayoutLine = async (
  status: Locator,
  ending: Ending,
): Promise<void> => {
  await (showsPayout(ending)
    ? expect(status).toContainText(`${TEXT.payout} ${ending.payoutFormatted}`)
    : expect(status).not.toContainText(TEXT.payout));
};

test.describe("T-24: a book round", () => {
  test("the backend's round has one round id, ending won with a payout and lost without", () => {
    const [won, lost] = ENDINGS;
    expect(won?.roundId).toBe(textAt(inputOf(BOUND), "roundId", BOUND));
    expect(lost?.roundId).toBe(won?.roundId);
    expect(won?.roundId).not.toBe(ROUND.roundId);
    expect(ENDINGS.map(ending => showsPayout(ending))).toEqual([true, false]);
  });

  for (const ending of ENDINGS) {
    test(`opens idle with its RTP, starts, and closes from starting to ${ending.vector} in one step, played back by the game`, async ({
      page,
      fakePlayApi,
    }) => {
      fakePlayApi.answer("getSnapshot", snapshotAnswer(IDLE));
      fakePlayApi.answer("startRound", snapshotAnswer(FUNDED, bookStartCheck));
      fakePlayApi.answer("getSnapshot", snapshotAnswer(BOUND));
      fakePlayApi.answerEvery("getSnapshot", snapshotAnswer(ending.vector));

      await launch(page, fakePlayApi);
      await expect(statusHeading(page)).toHaveText(TEXT.idle);
      await expect(page.getByText(rtpLine(BOOK.rtpDecimal))).toBeVisible();
      // The game frame is hidden at idle (W-55).
      await expect(page.locator("iframe")).toBeHidden();

      await recordHeadings(page);
      await page.getByRole("button", { name: TEXT.start }).click();
      // The `starting` polls (W-35) run on the page's clock.
      await advanceUntil(page, shows(statusHeading(page), ending.heading));

      expect(await headingsSeen(page)).toEqual([
        TEXT.idle,
        TEXT.starting,
        ending.heading,
      ]);
      // The result: the payout as its `formatted` only when it is above 0, the
      // round id, the verify link, and the next bet with the RTP line (W-54,
      // W-39, W-56).
      await expectPayoutLine(page.locator(".se-status"), ending);
      await expect(page.getByText(ending.roundId)).toBeVisible();
      await expect(page.getByRole("link", { name: TEXT.verify })).toBeVisible();
      await expect(
        page.getByRole("button", { name: TEXT.start }),
      ).toBeVisible();
      await expect(page.getByText(rtpLine(BOOK.rtpDecimal))).toBeVisible();

      // The game plays the draw back from its `playback` copy (W-55).
      await expect(page.locator("iframe")).toBeVisible();
      const game = gameFrame(page);
      await expect(
        game.getByText(`Book ${String(ending.drawIndex)} was drawn.`),
      ).toBeVisible();
      await expect(game.locator(".rg-event-type")).toHaveText([
        ...ending.eventTypes,
      ]);

      // One start, and nothing a book round never sends (W-51).
      expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
      expect(servedFor(fakePlayApi, "continueRound")).toEqual([]);
      expect(servedFor(fakePlayApi, "cashOutRound")).toEqual([]);
      expect(servedFor(fakePlayApi, "cancelRound")).toEqual([]);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }

  test("a start answered SESSION_REVOKED ends the session, and nothing more is sent", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", snapshotAnswer(IDLE));
    fakePlayApi.answer("startRound", {
      kind: "own-problem",
      code: "SESSION_REVOKED",
      status: 401,
      expect: bookStartCheck,
    });
    await launch(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    await page.getByRole("button", { name: TEXT.start }).click();
    await expect(statusHeading(page)).toHaveText(TEXT.sessionEnded);
    // The start was the session's last call: no refresh, read, or resend.
    await page.clock.runFor(60_000);
    expect(fakePlayApi.served.at(-1)?.operationId).toBe("startRound");
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
