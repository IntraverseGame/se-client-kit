// T-16 (AC5, W-42, W-44): each typed error the fake can answer, as the answer
// to a start, shows its message and `requestId` (a "try again" only when it is
// retryable, "Back to start" for a voided start), and `ROUND_ACTIVE` resumes
// the open round; the degraded states the fake can produce are each shown
// distinctly. Every state passes the
// accessibility audit. The out-of-sync state, the session-ending codes in a
// round, and a rejected Snapshot of the round are t16-round-errors.

import { auditAccessibility } from "./harness/accessibility.ts";
import {
  ENVIRONMENT_CONFIG_PATH,
  environmentConfig,
  serveEnvironmentConfig,
} from "./harness/environment-config.ts";
import { expect, test } from "./harness/fixtures.ts";
import { validVector } from "./harness/vectors.ts";
import {
  alertPanel,
  coverHeading,
  launch,
  launchAndStart,
  statusHeading,
  TEXT,
} from "./harness/wrapper-page.ts";

/** Each problem vector the start may answer, with what the player reads. */
const START_PROBLEMS: readonly (readonly [string, string])[] = [
  ["problem-insufficient-funds", "Your balance is too low for this bet."],
  ["problem-entropy-unavailable", "The round could not be prepared."],
  [
    "problem-default-code-invalid-argument",
    "The request could not be completed.",
  ],
  ["problem-default-code-unavailable", "The game is unavailable right now."],
  [
    "problem-default-code-unavailable-not-retryable",
    "The game is unavailable right now.",
  ],
  ["problem-default-code-unknown", "The request could not be completed."],
];

const fieldOf = (vector: string, key: string): unknown =>
  validVector(vector, "PlayProblem").input[key];

/** A voided start's control is "Back to start", not "Try again" (W-42). */
const VOIDED_START_VECTORS: ReadonlySet<string> = new Set([
  "problem-entropy-unavailable",
]);

/** The retry control a problem shows, only for a retryable one (W-42). */
const retryControl = (
  vector: string,
): {
  readonly name: string;
  readonly other: string;
  readonly count: number;
} => {
  const voided = VOIDED_START_VECTORS.has(vector);
  return {
    name: voided ? "Back to start" : "Try again",
    other: voided ? "Try again" : "Back to start",
    count: fieldOf(vector, "retryable") === true ? 1 : 0,
  };
};

test.describe("T-16: typed errors (W-42)", () => {
  for (const [vector, message] of START_PROBLEMS) {
    test(`${vector} shows its message and reference`, async ({
      page,
      fakePlayApi,
    }) => {
      fakePlayApi.answerEvery("getSnapshot", {
        kind: "snapshot",
        vector: "coinflip-idle",
      });
      // Every answer, so a retryable one is the same on each repeat.
      fakePlayApi.answerEvery("startRound", { kind: "problem", vector });
      await launchAndStart(page, fakePlayApi);
      await expect(alertPanel(page)).toContainText(TEXT.error, {
        timeout: 15_000,
      });
      await expect(alertPanel(page)).toContainText(message);
      await expect(alertPanel(page)).toContainText(
        String(fieldOf(vector, "requestId")),
      );
      const control = retryControl(vector);
      await expect(
        alertPanel(page).getByRole("button", { name: control.name }),
      ).toHaveCount(control.count);
      await expect(
        alertPanel(page).getByRole("button", { name: control.other }),
      ).toHaveCount(0);
      expect(await auditAccessibility(page)).toEqual([]);
    });
  }

  test("ROUND_ACTIVE resumes the open round, which this page cannot move in", async ({
    page,
    fakePlayApi,
  }) => {
    fakePlayApi.answer("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    fakePlayApi.answer("startRound", {
      kind: "problem",
      vector: "problem-round-active",
    });
    await launchAndStart(page, fakePlayApi);
    // The cover "This round can't be played here" over the game, mounted at D
    // (the redeem answer's) and inert: this page holds no round it can move in
    // (W-31, W-37, W-57, W-58).
    await expect(coverHeading(page)).toHaveText(TEXT.notHeld);
    await expect(page.locator("iframe")).toHaveCount(1);
    await expect(page.locator("iframe")).toHaveAttribute("inert", "");
    await expect(page.locator('.se-overlay[data-form="cover"]')).toBeVisible();
    expect(await auditAccessibility(page)).toEqual([]);
  });
});

test.describe("T-16: degraded states (W-44)", () => {
  test("the session ended", async ({ page, fakePlayApi }) => {
    fakePlayApi.answer("redeemLaunchCode", {
      kind: "problem",
      vector: "problem-redeem-unavailable",
    });
    await launch(page, fakePlayApi);
    await expect(coverHeading(page)).toHaveText(TEXT.sessionEnded);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the round failed verification: nothing is shown as ready", async ({
    page,
    fakePlayApi,
  }) => {
    // The vendored round is signed by another signer than the one this
    // environment pins (W-26, check 2).
    fakePlayApi.answer("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    fakePlayApi.answer("startRound", {
      kind: "snapshot",
      vector: "coinflip-active-create-round-auth",
    });
    await launchAndStart(page, fakePlayApi);
    await expect(alertPanel(page)).toContainText(TEXT.verificationFailed);
    await expect(page.getByText(TEXT.active)).toHaveCount(0);
    expect(await auditAccessibility(page)).toEqual([]);
  });

  test("the chain check is not independent (development)", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
  }) => {
    const base = environmentConfig(playApiBaseUrl);
    await serveEnvironmentConfig(context, {
      ...base,
      environment: "local",
      minRpcQuorum: 1,
    });
    fakePlayApi.answerEvery("getSnapshot", {
      kind: "snapshot",
      vector: "coinflip-idle",
    });
    await launch(page, fakePlayApi);
    await expect(page.getByText(TEXT.chainNotIndependent)).toBeVisible();
    await expect(statusHeading(page)).toHaveText(TEXT.idle);
    expect(ENVIRONMENT_CONFIG_PATH).toBe("/environment-config.json");
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
