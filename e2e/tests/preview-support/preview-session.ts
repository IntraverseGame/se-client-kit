// One preview session of a test (RFC-002): the launch through the hook, and what
// the browser's own responses tell the test, all in memory and never logged. The
// Snapshot a response carried is the reference for what the Wrapper should show;
// the play token is registered with the secret scan as a needle the moment the
// `sessions:redeem` response is read; the `version` of every Snapshot response
// is recorded for the W-29 helper. Nothing is written to a file, an annotation,
// or an attachment.

import type { BrowserContext, Page, Request, Response } from "@playwright/test";

import { redactSecrets, type SecretSource } from "../harness/secret-needles.ts";
import type { SecretScan } from "../harness/secret-scan.ts";
import type { PreviewDocument } from "./environment-document.ts";
import { type GameId, runLaunchHook } from "./launch-hook.ts";
import type { PreviewEnvironment } from "./preview-environment.ts";
import {
  playTokenOf,
  type SnapshotFacts,
  snapshotFacts,
  type VerificationFacts,
} from "./preview-snapshots.ts";
import type { VersionRecord } from "./snapshot-versions.ts";
import { readVerification } from "./verify-read.ts";

export type PreviewSession = {
  /** Runs the hook for `gameId`, registers the launch code, and navigates. */
  readonly launch: (page: Page, gameId: GameId) => Promise<void>;
  /** The Snapshot responses so far, in order of arrival. */
  readonly snapshots: () => readonly SnapshotFacts[];
  /** The latest Snapshot of a round that ended (`won` or `lost`). */
  readonly lastSettled: () => SnapshotFacts | undefined;
  /** How many distinct rounds have ended so far. */
  readonly settledCount: () => number;
  /** The version records for the W-29 helper. */
  readonly versions: () => readonly VersionRecord[];
  /**
   * How many calls the Wrapper sent that change a round (POSTs to the Play
   * API).
   */
  readonly roundCalls: () => number;
  /** Reads the verify API's answer for `roundId`; 200 or a plain error. */
  readonly verify: (roundId: string) => Promise<VerificationFacts>;
};

export type PreviewSessionOptions = {
  readonly context: BrowserContext;
  readonly environment: PreviewEnvironment;
  readonly document: PreviewDocument;
  readonly scan: SecretScan;
  /** The secrets to redact from a failure (the key draws, the launch code). */
  readonly sources: readonly SecretSource[];
};

/** The Play API routes that answer a Snapshot (`GET /snapshot`, the rounds). */
const SNAPSHOT_ROUTES: ReadonlySet<string> = new Set([
  "/snapshot",
  "/rounds:start",
  "/rounds:continue",
  "/rounds:cashOut",
  "/rounds:cancel",
]);

const REDEEM_ROUTE = "/sessions:redeem";

/** The route of `url` under the Play API base, or `undefined` when it is not. */
export const playRouteOf = (
  playApiBaseUrl: string,
  url: string,
): string | undefined => {
  try {
    const base = new URL(playApiBaseUrl);
    const target = new URL(url);
    const prefix = base.pathname.replace(/\/$/u, "");
    return target.origin === base.origin && target.pathname.startsWith(prefix)
      ? target.pathname.slice(prefix.length)
      : undefined;
  } catch {
    return undefined;
  }
};

export const createPreviewSession = (
  options: PreviewSessionOptions,
): PreviewSession => {
  const { context, environment, document, scan, sources } = options;
  const snapshots: SnapshotFacts[] = [];
  const versions: VersionRecord[] = [];
  const startedAt = new WeakMap<Request, number>();
  let roundCalls = 0;
  const launchSources: SecretSource[] = [...sources];
  /** The Snapshots of a round that ended, in order of arrival. */
  const settled = (): readonly SnapshotFacts[] =>
    snapshots.filter(
      facts =>
        (facts.status === "won" || facts.status === "lost") &&
        facts.roundId !== undefined,
    );

  context.on("request", (request: Request) => {
    startedAt.set(request, performance.now());
    const route = playRouteOf(document.playApiBaseUrl, request.url());
    if (route?.startsWith("/rounds:") === true && request.method() === "POST") {
      roundCalls += 1;
    }
  });

  const read = async (response: Response): Promise<void> => {
    const route = playRouteOf(document.playApiBaseUrl, response.url());
    if (route === undefined) return;
    const isSnapshot = SNAPSHOT_ROUTES.has(route);
    if (route !== REDEEM_ROUTE && !isSnapshot) return;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Not JSON, or gone with the page: nothing to read.
      return;
    }
    const endedAt = performance.now();
    if (route === REDEEM_ROUTE) {
      const token = playTokenOf(body);
      if (token !== undefined) scan.addSecret("play token", token);
      return;
    }
    const facts = snapshotFacts(body);
    if (facts === undefined) return;
    snapshots.push(facts);
    versions.push({
      startedAt: startedAt.get(response.request()) ?? endedAt,
      endedAt,
      version: facts.version,
    });
  };
  context.on("response", (response: Response) => {
    void read(response);
  });

  return {
    launch: async (page, gameId) => {
      const line = await runLaunchHook({
        command: environment.launchCommand,
        gameId,
        previewOrigin: environment.origin,
        env: process.env,
      });
      // Registered before the navigation (the code is in the URL's fragment).
      scan.addSecret("launch code", line.code);
      launchSources.push(() => [{ label: "launch code", value: line.code }]);
      scan.allowLaunchNavigation(line.url);
      try {
        await page.goto(line.url);
      } catch (error: unknown) {
        // Playwright's message names the URL, whose fragment is the code.
        const message = error instanceof Error ? error.message : "failed";
        // oxlint-disable-next-line preserve-caught-error -- the cause is Playwright's error, which names the launch URL
        throw new Error(redactSecrets(message, launchSources));
      }
    },
    snapshots: () => [...snapshots],
    lastSettled: () => settled().at(-1),
    settledCount: () => new Set(settled().map(facts => facts.roundId)).size,
    versions: () => [...versions],
    roundCalls: () => roundCalls,
    verify: roundId =>
      readVerification({
        verifyApiBaseUrl: document.verifyApiBaseUrl,
        allowedOrigins: environment.allowedOrigins,
        roundId,
      }),
  };
};
