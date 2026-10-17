// The secret scan's own tests, beyond the per-channel negative tests
// (secret-scan-channels.spec.ts): the leaking page leaking nothing passes; an
// unregistered token-shaped string is found; a channel that cannot be read
// fails the scan, except a SecurityError in an opaque frame; and a draw made
// just before a scan is seen.

import { expect, test } from "./harness/fixtures.ts";
import { frameNamed } from "./harness/frames.ts";
import { openLeakyPage } from "./harness/leaky-page.ts";
import { ORIGIN_AT_START } from "./harness/origin-capture.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

test.describe("the secret scan", () => {
  test("passes a page that opens a session and leaks nothing", async ({
    page,
    fakePlayApi,
    randomDraws,
    secretScan,
  }) => {
    await openLeakyPage(page, fakePlayApi, secretScan, "none", "token");
    // The scan had real secrets to look for: the code, a token, and a key.
    expect(fakePlayApi.secrets().map(secret => secret.label)).toEqual([
      "launch code",
      "play token 0",
    ]);
    expect(randomDraws.draws().map(draw => draw.length)).toContain(32);
    await secretScan.expectClean();
  });

  test("finds a token-shaped string the test never registered", async ({
    page,
    fakePlayApi,
    secretScan,
  }) => {
    await openLeakyPage(page, fakePlayApi, secretScan, "none", "token");
    await page.evaluate(() => {
      console.log(`pt_${"A".repeat(43)}`);
    });
    const findings = await secretScan.findings();
    expect(findings).toContainEqual(
      expect.objectContaining({ channel: "console", secret: "a play token" }),
    );
  });

  test("fails on a channel it cannot read, naming only the error", async ({
    page,
    fakePlayApi,
    secretScan,
  }) => {
    await openLeakyPage(page, fakePlayApi, secretScan, "none", "token");
    await page.evaluate(() => {
      IDBFactory.prototype.databases = () =>
        Promise.reject(new DOMException("broken on purpose", "UnknownError"));
    });
    expect(await secretScan.findings()).toEqual([
      {
        channel: "unreadable",
        secret: "UnknownError",
        detail: "indexeddb: UnknownError",
      },
    ]);
  });

  test("fails on a console argument it cannot serialize", async ({
    page,
    fakePlayApi,
    secretScan,
  }) => {
    await openLeakyPage(page, fakePlayApi, secretScan, "none", "token");
    await page.evaluate(() => {
      console.log({
        get boom(): never {
          throw new RangeError("unreadable on purpose");
        },
      });
    });
    expect(await secretScan.findings()).toContainEqual({
      channel: "unreadable",
      secret: "RangeError",
      detail: "console argument: RangeError",
    });
  });

  test("excuses only a SecurityError in an opaque frame", async ({
    page,
    secretScan,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/framed.html`);
    const opaque = await frameNamed(page, "opaque");
    // The origin recorded before any page code ran is what the excuse reads.
    expect(
      await opaque.evaluate(
        name => Reflect.get(globalThis, name),
        ORIGIN_AT_START,
      ),
    ).toBe("null");
    await secretScan.expectClean();
  });

  test("sees a draw made just before the scan", async ({
    page,
    secretScan,
  }) => {
    await page.goto(`${PAGES_ORIGIN}/blank.html`);
    await page.evaluate(() => {
      const key = crypto.getRandomValues(new Uint8Array(32));
      console.log(
        Array.from(key, b => b.toString(16).padStart(2, "0")).join(""),
      );
    });
    expect(await secretScan.findings()).toContainEqual(
      expect.objectContaining({
        channel: "console",
        secret: "32-byte random draw 0",
      }),
    );
  });
});
