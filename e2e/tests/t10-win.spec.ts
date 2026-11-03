// T-10 (AC1, W-22 to W-26, W-31, W-39): a win, in the Wrapper's release bundle
// against the fake Play API: the start carries the session's key (the
// vendored round's), the round passes the `CreateRoundAuth` checks and the tip
// check against the fake RPC endpoints and is shown ready with the game, the
// player's move is signed with the vendored bytes, and the result shows the
// Snapshot's payout as `formatted` (W-31), the round id, and the verify link.
// The result passes the accessibility audit.

import { auditAccessibility } from "./harness/accessibility.ts";
import { callTails, expect, test, toReady } from "./harness/round-play.ts";
import { pickCheck, ROUND } from "./harness/round-vector.ts";
import { validVector } from "./harness/vectors.ts";
import { servedFor, statusHeading, TEXT } from "./harness/wrapper-page.ts";

/** The won answer, with its `payout`. */
const WON = "coinflip-won-payout";

/** The vector's own `payout.formatted`, read at run time. */
const payoutFormatted = (): string => {
  const { payout } = validVector(WON, "Snapshot").input as {
    readonly payout?: { readonly formatted?: unknown };
  };
  if (typeof payout?.formatted !== "string") {
    throw new TypeError(`${WON} carries no payout`);
  }
  return payout.formatted;
};

test.describe("T-10: a win", () => {
  test("starts, is checked, is played, and shows the result with its round id and verify link", async ({
    page,
    fakePlayApi,
    fakeRpc,
  }) => {
    await toReady(page, fakePlayApi);
    await expect(statusHeading(page)).toHaveText(TEXT.active);
    // The tip check asked both endpoints (W-26b).
    const providers = new Set(fakeRpc.calls().map(call => call.provider));
    expect([...providers].toSorted()).toEqual(["p1", "p2"]);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: WON,
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.won);
    await expect(page.locator(".se-round")).toContainText(
      `${TEXT.payout} ${payoutFormatted()}`,
    );
    await expect(page.getByText(ROUND.roundId)).toBeVisible();
    await expect(page.getByRole("link", { name: TEXT.verify })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(servedFor(fakePlayApi, "startRound")).toHaveLength(1);
    expect(servedFor(fakePlayApi, "continueRound")).toHaveLength(1);
    expect(await auditAccessibility(page)).toEqual([]);
  });
});
