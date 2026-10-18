// The secret scan's negative tests, one per channel (requirement 3): a
// deliberately leaking page opens a session against the fake Play API, draws
// its key from the seeded random source, and leaks one secret through one
// channel; the scan must fail and name that channel and that secret, and no
// finding may repeat any form of any secret. Two channels cannot be written in
// one browser each, so their leak cannot happen there and the test is skipped
// in that browser only, with the reason (decided by the human, 2026-10-18).

import { expect, test } from "./harness/fixtures.ts";
import {
  SECRET_LABEL,
  openLeakyPage,
  repeatingFindings,
  type Leaked,
} from "./harness/leaky-page.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import type { ScanChannel } from "./harness/secret-scan.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

/** A channel the leaking page cannot write in one browser, and why. */
const NOT_WRITABLE: Readonly<
  Partial<
    Record<ScanChannel, { readonly browser: string; readonly reason: string }>
  >
> = {
  "service-worker": {
    browser: "firefox",
    reason:
      "Firefox cannot register a service worker here: Playwright does not route its script fetch, which then meets the dead proxy (hermetic-proxy.spec.ts proves it)",
  },
  "origin-private-file-system": {
    browser: "webkit",
    reason:
      "WebKit has no origin private file system here: a write fails, and the scan's WebKit excuse covers the read (secret-scan-opfs.spec.ts)",
  },
};

/** No browser: the channel is written everywhere. */
const EVERYWHERE = { browser: "", reason: "" } as const;

const CASES: readonly (readonly [ScanChannel, Leaked])[] = [
  ["console", "token"],
  ["console", "key"],
  ["console", "key-decimal"],
  ["page-error", "token"],
  ["request-url", "code"],
  ["navigation", "token"],
  ["document-url", "token"],
  ["history-state", "token"],
  ["local-storage", "token"],
  ["session-storage", "token"],
  ["indexeddb", "key"],
  ["indexeddb", "token"],
  ["cache-storage", "token"],
  ["cookie", "token"],
  ["service-worker", "token"],
  ["origin-private-file-system", "token"],
];

test.describe("the secret scan, per channel", () => {
  for (const [channel, what] of CASES) {
    const skip = NOT_WRITABLE[channel] ?? EVERYWHERE;
    test(`fails on the ${what} leaked through ${channel}`, async ({
      page,
      browserName,
      fakePlayApi,
      randomDraws,
      secretScan,
    }) => {
      test.skip(browserName === skip.browser, skip.reason);
      await openLeakyPage(page, fakePlayApi, secretScan, channel, what);
      const findings = await secretScan.findings();
      expect(findings).toContainEqual(
        expect.objectContaining({
          channel,
          secret: expect.stringMatching(SECRET_LABEL[what]),
        }),
      );
      await expect(secretScan.expectClean()).rejects.toThrow(
        /the secret scan found/u,
      );
      expect(repeatingFindings(findings, fakePlayApi, randomDraws)).toEqual([]);
    });
  }

  test("fails on the token leaked through a WebSocket URL", async ({
    page,
    fakePlayApi,
    hermetic,
    randomDraws,
    secretScan,
  }) => {
    await openLeakyPage(
      page,
      fakePlayApi,
      secretScan,
      "websocket-url",
      "token",
    );
    const findings = await secretScan.findings();
    expect(findings).toContainEqual(
      expect.objectContaining({
        channel: "websocket-url",
        secret: "play token 0",
      }),
    );
    expect(repeatingFindings(findings, fakePlayApi, randomDraws)).toEqual([]);
    // The guard refused the socket, and its record is redacted too.
    expect(hermetic.takeRefused()).toEqual([
      "websocket wss://socket.e2e.test/live?t=[redacted]",
    ]);
  });
});
