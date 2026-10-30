// The round tests' harness (T-10, T-11, T-14, T-15, T-16, T-19): a session that
// plays the vendored Coin Flip round. That round's `CreateRoundAuth`
// (`valid/coinflip-active-ready-hash` and every vector of the same round) was
// signed for the action key of the `signed-action/coinflip-cancel` vector, so
// the round tests make the session's key that one: the seeded random source
// gives the Wrapper's key draw the vector's public test key, read here at run
// time from `contracts`' test-only entry (vectors.ts) and never copied into a
// file (AGENTS.md). The configuration pins the round's signer, domain, and
// entropy source, and the tip check's RPC endpoints are the fake ones
// (fake-rpc.ts), so the round passes W-26 unless a test makes an endpoint fail.
//
// The fake Play API checks what the Wrapper sends against the vectors: the
// start's `actionKey` is the round's (which proves the scripted key is the
// session's), the move's `typedData` is `typed-data/coinflip-pick`'s, and the
// cancel's `typedData` and `signature` are the cancel vectors' byte for byte.
// The key never reaches a bundle: only tests import the test-only entry
// (`check:contracts`), and the suite builds nothing. It never reaches a file
// either: its bytes are an `addInitScript` argument, which a Playwright trace
// would record, so the round fixture refuses to run with tracing on.
//
// Every round test installs `page.clock` before the page loads. It is not
// paused: the Wrapper's timers also run in real time, and a test moves them
// forward with `advanceUntil` or `page.clock.runFor`, so a poll or a retry comes
// at once instead of after its real delay. Pausing it (`pauseAt`) before load
// stops the Wrapper's boot, whose own timers must run, and pausing after load
// would race those timers against the network, so it stays unpaused; no round
// assertion depends on a timer not firing in real time.

import type {
  Clock,
  FrameLocator,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test";

import {
  roundEnvironmentConfig,
  ROUND_RPC_ENDPOINTS,
  serveEnvironmentConfig,
} from "./environment-config.ts";
import type { FakePlayApi } from "./fake-play-types.ts";
import type { Answer, BodyCheck } from "./fake-play-wire.ts";
import { createFakeRpc, type FakeRpc } from "./fake-rpc.ts";
import { expect, test as base } from "./fixtures.ts";
import { WRAPPER_ORIGIN } from "./origins.ts";
import { keyDrawSecrets, stubRandomValues } from "./random-stub.ts";
import {
  cancelCheck,
  keyDrawBytes,
  ROUND,
  ROUND_PINS,
  ROUND_VECTOR,
  startCheck,
} from "./round-vector.ts";
import { isPlayable, launchAndStart } from "./wrapper-page.ts";

/** The trace mode of the project a test runs in: `off` unless set. */
const traceMode = (testInfo: TestInfo): string => {
  const { trace } = testInfo.project.use;
  if (trace === undefined) return "off";
  return typeof trace === "string" ? trace : trace.mode;
};

type RoundFixtures = {
  /** The tip check's fake RPC endpoints (fake-rpc.ts). */
  readonly fakeRpc: FakeRpc;
  /** The page's clock, installed before it loads (the Wrapper's timers). */
  readonly pageClock: Clock;
};

/**
 * The suite's `test` with the round: the random source scripts the Wrapper's
 * key draw, the configuration pins the round, and the RPC endpoints are fake.
 * Overrides `randomDraws` here, so the shared fixtures stay as they are.
 */
export const test = base.extend<RoundFixtures>({
  // An override keeps the shared fixture's registration (automatic).
  randomDraws: async ({ context, hermetic, seed }, use, testInfo) => {
    // The key's bytes are the init script's argument: a trace would write them
    // to a file (playwright.config.ts keeps tracing off).
    expect(traceMode(testInfo), "tracing must be off in the round tests").toBe(
      "off",
    );
    const draws = await stubRandomValues(context, seed, {
      origin: WRAPPER_ORIGIN,
      bytes: keyDrawBytes(),
    });
    // The scripted draw is the session's key: the secret scan and the
    // hermetic guard treat it as one, as every 32-byte draw.
    hermetic.addSecretSource(keyDrawSecrets(draws));
    await use(draws);
  },

  // After `hermetic`, so these routes take their requests before its
  // catch-all, and after the shared origins, so this configuration is served.
  fakeRpc: [
    async ({ context, hermetic: _guard, playApiBaseUrl }, use) => {
      await serveEnvironmentConfig(
        context,
        roundEnvironmentConfig(playApiBaseUrl, ROUND_PINS),
      );
      const rpc = createFakeRpc({
        endpoints: ROUND_RPC_ENDPOINTS,
        chainId: BigInt(ROUND_PINS.entropyChainId),
        blockNumber: ROUND.blockNumber,
        allowOrigin: WRAPPER_ORIGIN,
      });
      await rpc.install(context);
      await use(rpc);
      expect(rpc.unexpected(), "calls the fake RPC did not know").toEqual([]);
    },
    { auto: true },
  ],

  // Installed, not paused (see the header): real time still moves the timers.
  pageClock: [
    async ({ page }, use) => {
      await page.clock.install();
      await use(page.clock);
    },
    { auto: true },
  ],
});

export { expect };

/** Whether `locator`'s text holds `text` now (for `advanceUntil`). */
export const shows =
  (locator: Locator, text: string) => async (): Promise<boolean> =>
    ((await locator.textContent()) ?? "").includes(text);

/** The Wrapper's timers move 500 ms at a time until `done` holds. */
export const advanceUntil = async (
  page: Page,
  done: () => Promise<boolean>,
): Promise<void> => {
  await expect
    .poll(
      async () => {
        if (await done()) return true;
        await page.clock.runFor(500);
        return done();
      },
      { timeout: 15_000 },
    )
    .toBe(true);
};

/** A Snapshot answer of the `valid/` vector `vector`, for any Snapshot call. */
export type SnapshotAnswer = {
  readonly kind: "snapshot";
  readonly vector: string;
  readonly expect?: BodyCheck;
};

/** A Snapshot answer of the `valid/` vector `vector`. */
export const snapshotAnswer = (
  vector: string,
  check?: BodyCheck,
): SnapshotAnswer =>
  check === undefined
    ? { kind: "snapshot", vector }
    : { kind: "snapshot", vector, expect: check };

/**
 * A session at `idle` whose start is answered `starting` and then, on every
 * later read, the round `active` with `T_0` settled.
 */
export const scriptRound = (fake: FakePlayApi): void => {
  fake.answer("getSnapshot", snapshotAnswer("coinflip-idle"));
  fake.answer("startRound", snapshotAnswer("coinflip-starting", startCheck));
  fake.answerEvery("getSnapshot", snapshotAnswer(ROUND_VECTOR));
};

/**
 * A session whose start is answered with the round `active` at once, so a
 * failed tip check signs the cancel inside the start, and the cancel's reads
 * are the session's next reads, in order: the cancel answered `resolving`, then
 * `reads`.
 */
export const scriptCancel = (
  fake: FakePlayApi,
  reads: readonly Answer<"getSnapshot">[],
): void => {
  fake.answer("getSnapshot", snapshotAnswer("coinflip-idle"), ...reads);
  fake.answer("startRound", snapshotAnswer(ROUND_VECTOR, startCheck));
  fake.answer("cancelRound", {
    kind: "snapshot",
    vector: "coinflip-resolving-cancel",
    expect: cancelCheck,
  });
};

/** The game frame. */
export const gameFrame = (page: Page): FrameLocator =>
  page.frameLocator("iframe");

/**
 * Launches, starts, and waits until the game is shown ready (W-26 passed). With
 * `scan`, the launch navigation is allowed in the secret scan.
 */
export const toReady = async (
  page: Page,
  fake: FakePlayApi,
  scan?: Parameters<typeof launchAndStart>[2],
): Promise<FrameLocator> => {
  scriptRound(fake);
  await launchAndStart(page, fake, scan);
  // The `starting` poll (W-35) runs on the page's clock. The frame shows from
  // its mount: the round is ready once it is playable (W-57, W-58).
  await advanceUntil(page, () => isPlayable(page));
  return gameFrame(page);
};

/** The player calls tails in the game: option 1, the vector's move. */
export const callTails = async (page: Page): Promise<void> => {
  await gameFrame(page).getByRole("button", { name: "Tails" }).click();
};
