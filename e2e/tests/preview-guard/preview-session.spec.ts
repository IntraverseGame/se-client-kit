// The preview session's observation of the browser's own responses (RFC-002),
// proven on the fake round of T-10 (Q8: where a fake round can stand in): the
// Snapshot a response carried is read in memory (the payout as a `bigint`, the
// round id, the version), the play token is registered with the scan as a needle
// the moment the `sessions:redeem` response is read, the version of every
// Snapshot response is recorded for the W-29 helper, and the calls that change a
// round are counted. The launch hook and the verify API read are proven by their
// own specs; the three preview specs run against a real stack in the backend's
// job.

import { callTails, expect, test, toReady } from "../harness/round-play.ts";
import { pickCheck } from "../harness/round-vector.ts";
import { statusHeading, TEXT } from "../harness/wrapper-page.ts";
import { parsePreviewEnvironment } from "../preview-support/preview-environment.ts";
import { expectSettledRound } from "../preview-support/preview-rounds.ts";
import {
  createPreviewSession,
  playRouteOf,
} from "../preview-support/preview-session.ts";
import { versionDecreases } from "../preview-support/snapshot-versions.ts";
import { startTestServer, type TestServer } from "./loopback-server.ts";

const ENVIRONMENT = parsePreviewEnvironment({
  SE_E2E_PREVIEW_ORIGIN: "https://wrapper.e2e.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
  SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.e2e-games.test",
});

test.describe("the preview session", () => {
  test("reads the Snapshots, the token, the versions, and the round calls of a won round", async ({
    page,
    context,
    fakePlayApi,
    playApiBaseUrl,
    secretScan,
  }) => {
    const registered: string[] = [];
    const session = createPreviewSession({
      context,
      environment: ENVIRONMENT,
      document: {
        playApiBaseUrl,
        verifyApiBaseUrl: "https://verify.e2e.test/verify/v1",
        gameOrigins: [],
        rpcUrls: [],
      },
      scan: {
        ...secretScan,
        addSecret: (label, value) => {
          registered.push(label);
          secretScan.addSecret(label, value);
        },
      },
      sources: [],
    });
    await toReady(page, fakePlayApi, secretScan);
    fakePlayApi.answer("continueRound", {
      kind: "snapshot",
      vector: "coinflip-won-payout",
      expect: pickCheck,
    });
    await callTails(page);
    await expect(statusHeading(page)).toHaveText(TEXT.won);
    await expect.poll(() => session.settledCount()).toBe(1);

    const settled = session.lastSettled();
    expect(settled).toMatchObject({
      status: "won",
      payout: { value: 194n, unit: "EUR", formatted: "€1.94" },
    });
    expect(typeof settled?.payout?.value).toBe("bigint");
    expect(typeof settled?.roundId).toBe("string");
    expect(registered).toContain("play token");
    // The start and the move: the calls that change a round.
    expect(session.roundCalls()).toBe(2);
    expect(session.snapshots().length).toBeGreaterThan(1);
    expect(session.versions()).toHaveLength(session.snapshots().length);
    for (const record of session.versions()) {
      expect(record.endedAt).toBeGreaterThanOrEqual(record.startedAt);
    }
    // The fake's versions rise, so the W-29 helper finds nothing.
    expect(versionDecreases(session.versions())).toEqual([]);
    await secretScan.expectClean();
  });

  test.describe("a settled round, checked against the verify API", () => {
    test.skip(
      ({ browserName }) => browserName !== "chromium",
      "loopback is reachable in the Chromium project only",
    );

    let started: TestServer | undefined;
    test.beforeAll(async () => {
      started = await startTestServer();
    });
    test.afterAll(async () => {
      await started?.close();
    });

    /** Plays the fake win, then checks it with `verifyBody` as the API's answer. */
    const checked = async (
      args: Pick<
        Parameters<Parameters<typeof test>[2]>[0],
        "page" | "context" | "fakePlayApi" | "playApiBaseUrl" | "secretScan"
      >,
      verifyBody: unknown,
    ): Promise<void> => {
      if (started === undefined) throw new Error("the server is not started");
      const { page, context, fakePlayApi, playApiBaseUrl, secretScan } = args;
      const environment = parsePreviewEnvironment({
        SE_E2E_PREVIEW_ORIGIN: "https://wrapper.e2e.test",
        SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
        SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.e2e-games.test",
        SE_E2E_PREVIEW_ALLOWED_ORIGINS: started.origin,
      });
      const session = createPreviewSession({
        context,
        environment,
        document: {
          playApiBaseUrl,
          verifyApiBaseUrl: `${started.origin}/verify/v1`,
          gameOrigins: [],
          rpcUrls: [],
        },
        scan: secretScan,
        sources: [],
      });
      await toReady(page, fakePlayApi);
      fakePlayApi.answer("continueRound", {
        kind: "snapshot",
        vector: "coinflip-won-payout",
        expect: pickCheck,
      });
      await callTails(page);
      await expect(statusHeading(page)).toHaveText(TEXT.won);
      await expect.poll(() => session.settledCount()).toBe(1);
      started.serve(
        `/verify/v1/rounds/${session.lastSettled()?.roundId}`,
        verifyBody,
      );
      await expectSettledRound(page, session, "won", 0);
    };

    test("passes when the verify API agrees on status and payout", async ({
      page,
      context,
      fakePlayApi,
      playApiBaseUrl,
      secretScan,
    }) => {
      await checked(
        { page, context, fakePlayApi, playApiBaseUrl, secretScan },
        {
          roundId: "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d",
          status: "won",
          payout: { amount: "194", currency: "EUR", decimals: 2 },
        },
      );
    });

    test("fails when the verify API's payout differs", async ({
      page,
      context,
      fakePlayApi,
      playApiBaseUrl,
      secretScan,
    }) => {
      await expect(
        checked(
          { page, context, fakePlayApi, playApiBaseUrl, secretScan },
          {
            roundId: "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d",
            status: "won",
            payout: { amount: "195", currency: "EUR", decimals: 2 },
          },
        ),
      ).rejects.toThrow();
    });
  });

  test("finds the route of a URL under the Play API base, and only there", () => {
    const base = "https://stack.example.test/play/v1";
    expect(playRouteOf(base, `${base}/sessions:redeem`)).toBe(
      "/sessions:redeem",
    );
    expect(playRouteOf(base, `${base}/rounds:start?x=1`)).toBe("/rounds:start");
    expect(
      playRouteOf(base, "https://stack.example.test/other"),
    ).toBeUndefined();
    expect(
      playRouteOf(base, "https://elsewhere.test/play/v1/snapshot"),
    ).toBeUndefined();
    expect(playRouteOf(base, "not a url")).toBeUndefined();
  });
});
