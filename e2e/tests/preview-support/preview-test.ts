// The preview specs' `test` (RFC-002): the worker browser of the suite
// (`harness/worker-browser.ts`), extended with the fixtures a real-stack run
// stands on, in place of the fake's (`harness/fixtures.ts`), which a preview spec
// never imports. Automatic for every test: the preview guard (deny by default,
// with the allow-list), the shared game origin served by a route from the
// reference game's build, and the seeded `crypto.getRandomValues` with one
// action key per test generated here in Node (never the public vector key,
// Q7). On request: the secret scan, the environment document, and the session.
//
// Tracing must be off: the scripted key draw is an init-script argument, which a
// trace would write to a file. The key's bytes are never logged, attached, or
// written; it is registered with the scan and the guard's redaction like any
// draw. The variables are parsed again here, in the worker that runs the
// test, from the environment it inherits from the launcher.

import { randomBytes } from "node:crypto";

import type { TestInfo } from "@playwright/test";

import {
  keyDrawSecrets,
  type RandomDraws,
  stubRandomValues,
} from "../harness/random-stub.ts";
import { startSecretScan, type SecretScan } from "../harness/secret-scan.ts";
import { expect, test as base } from "../harness/worker-browser.ts";
import {
  loadPreviewDocument,
  type PreviewDocument,
} from "./environment-document.ts";
import { installPreviewNetwork, type PreviewGuard } from "./preview-network.ts";
import {
  type PreviewEnvironment,
  previewEnvironmentFromProcess,
} from "./preview-process-environment.ts";
import {
  createPreviewSession,
  type PreviewSession,
} from "./preview-session.ts";
import { versionDecreases } from "./snapshot-versions.ts";

type PreviewFixtures = {
  readonly previewEnvironment: PreviewEnvironment;
  readonly previewDocument: PreviewDocument;
  readonly guard: PreviewGuard;
  readonly randomDraws: RandomDraws;
  readonly secretScan: SecretScan;
  readonly session: PreviewSession;
};

/** The trace mode of the project a test runs in: `off` unless set. */
const traceMode = (testInfo: TestInfo): string => {
  const { trace } = testInfo.project.use;
  if (trace === undefined) return "off";
  return typeof trace === "string" ? trace : trace.mode;
};

export const test = base.extend<PreviewFixtures>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a function needs from its destructuring
  previewEnvironment: async ({}, use) => {
    await use(previewEnvironmentFromProcess());
  },

  previewDocument: async ({ previewEnvironment }, use) => {
    await use(await loadPreviewDocument(previewEnvironment));
  },

  guard: [
    async ({ context, previewEnvironment }, use) => {
      const guard = await installPreviewNetwork(context, previewEnvironment);
      await use(guard);
      expect(guard.refused(), "origins outside the allow-list").toEqual([]);
    },
    { auto: true },
  ],

  randomDraws: [
    async ({ context, guard, previewEnvironment }, use, testInfo) => {
      expect(traceMode(testInfo), "tracing must be off in preview").toBe("off");
      const seed = randomBytes(4).readUInt32LE();
      // One key per test, the same for every document of it: the scan knows it.
      const draws = await stubRandomValues(context, seed, {
        origin: previewEnvironment.origin,
        bytes: [...randomBytes(32)],
      });
      guard.addSecretSource(keyDrawSecrets(draws));
      await use(draws);
    },
    { auto: true },
  ],

  secretScan: async ({ context, guard, randomDraws }, use) => {
    await use(
      startSecretScan(context, {
        sources: [keyDrawSecrets(randomDraws)],
        settle: randomDraws.settled,
        webSocketUrls: guard.webSocketUrls,
      }),
    );
  },

  session: async (
    { context, previewDocument, previewEnvironment, randomDraws, secretScan },
    use,
  ) => {
    const session = createPreviewSession({
      context,
      environment: previewEnvironment,
      document: previewDocument,
      scan: secretScan,
      sources: [keyDrawSecrets(randomDraws)],
    });
    await use(session);
    // W-29: a version never goes down among responses that did not overlap.
    expect(
      versionDecreases(session.versions()),
      "Snapshot versions that went down",
    ).toEqual([]);
  },
});

export { expect };
