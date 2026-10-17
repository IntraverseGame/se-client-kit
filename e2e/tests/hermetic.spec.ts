// The hermetic guard's own tests: a request or a WebSocket to any origin the
// suite does not serve is refused before it leaves the browser, and recorded
// (with every known secret redacted) so the test that made it fails. Also the
// static origin's answer to a malformed path, and the redaction of the fake
// Play API's own records.

import { expect, test } from "./harness/fixtures.ts";
import { PAGES_ORIGIN } from "./harness/origins.ts";
import { openSession } from "./harness/play-calls.ts";

test.use({ playApiBaseUrl: `${PAGES_ORIGIN}/play/v1` });

test.beforeEach(async ({ page }) => {
  await page.goto(`${PAGES_ORIGIN}/blank.html`);
});

test("refuses and records a request outside the fake origins", async ({
  page,
  hermetic,
}) => {
  const outcome = await page.evaluate(() =>
    fetch("https://outside.e2e.test/probe").then(
      () => "answered",
      () => "refused",
    ),
  );
  expect(outcome).toBe("refused");
  expect(hermetic.takeRefused()).toEqual(["https://outside.e2e.test/probe"]);
});

test("refuses and records a WebSocket", async ({ page, hermetic }) => {
  const closed = await page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const socket = new WebSocket("wss://outside.e2e.test/socket");
        socket.addEventListener("open", () => {
          resolve("opened");
        });
        socket.addEventListener("close", event => {
          resolve(`closed ${event.code}`);
        });
      }),
  );
  expect(closed).toBe("closed 1008");
  expect(hermetic.takeRefused()).toEqual([
    "websocket wss://outside.e2e.test/socket",
  ]);
});

test("redacts every known secret from a refused URL", async ({
  page,
  fakePlayApi,
  hermetic,
}) => {
  const token = await openSession(page, fakePlayApi);
  await page.evaluate(
    async address => {
      await fetch(address).catch(() => null);
    },
    `https://outside.e2e.test/probe?t=${btoa(token)}&c=${encodeURIComponent(token)}`,
  );
  expect(hermetic.takeRefused()).toEqual([
    "https://outside.e2e.test/probe?t=[redacted]&c=[redacted]",
  ]);
});

test("redacts every known secret from the fake's records", async ({
  page,
  fakePlayApi,
}) => {
  const token = await openSession(page, fakePlayApi);
  await page.evaluate(
    async ({ address, bearer }) => {
      await fetch(address, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}` },
      });
    },
    { address: `/play/v1/rounds:${token}`, bearer: token },
  );
  expect(fakePlayApi.takeUnexpected()).toEqual([
    "POST /play/v1/rounds:[redacted]: no such route",
  ]);
});

test("answers a malformed escape in a path with a 404", async ({ page }) => {
  const status = await page.evaluate(
    async () => (await fetch("/%E0%A4%A")).status,
  );
  expect(status).toBe(404);
});
