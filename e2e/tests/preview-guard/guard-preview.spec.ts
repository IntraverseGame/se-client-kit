// `guardPreview` (RFC-002), against a local loopback test server (Chromium
// project only: loopback is not real network and reaches no host, and the other
// projects' dead proxy hijacks it). The tests run in a browser of their own with
// the preview project's flags (preview-browser.ts), since the fake Chromium
// project resolves no host. A request to an allowed origin is continued to the
// server; a request to any other origin is refused and recorded as an origin
// with no path or query (a request URL with a sentinel in its path proves the
// sentinel is not in the record, the failure message, or any attachment); an
// allowed WebSocket is connected to the server; a disallowed one is closed with
// the policy-violation code; and a request the test makes itself is checked on
// the same list and refused before it is sent, naming the origin only.

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../harness/worker-browser.ts";
import {
  assertAllowedUrl,
  guardPreview,
  OriginRefusedError,
  type PreviewGuard,
} from "../preview-support/guard-preview.ts";
import { startTestServer, type TestServer } from "./loopback-server.ts";
import { launchPreviewBrowser } from "./preview-browser.ts";

const SENTINEL = "SENTINEL-IN-A-PATH-OR-QUERY";
const OFF_LIST = "https://off-list.example.test";

/** How a WebSocket to `address` ended, as the page sees it. */
const socketOutcome = (page: Page, address: string): Promise<string> =>
  page.evaluate(
    url =>
      new Promise<string>(resolve => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => {
          resolve("opened");
        });
        socket.addEventListener("close", event => {
          resolve(`closed ${String(event.code)}`);
        });
      }),
    address,
  );

type Held = {
  readonly server: TestServer;
  readonly context: BrowserContext;
  readonly guard: PreviewGuard;
  readonly page: Page;
};

test.describe("guardPreview", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "loopback is reachable in the Chromium project only",
  );

  let startedServer: TestServer | undefined;
  let startedBrowser: Browser | undefined;
  let held: Held | undefined;

  /** What the current test runs against; set up for each test. */
  const current = (): Held => {
    if (held === undefined) throw new Error("the test is not set up");
    return held;
  };

  test.beforeAll(async ({ playwright }) => {
    startedServer = await startTestServer();
    startedBrowser = await launchPreviewBrowser(playwright.chromium, [
      startedServer.origin,
    ]);
  });

  test.afterAll(async () => {
    await startedBrowser?.close();
    await startedServer?.close();
  });

  test.beforeEach(async () => {
    if (startedBrowser === undefined || startedServer === undefined) return;
    const context = await startedBrowser.newContext();
    const guard = await guardPreview(context, [startedServer.origin]);
    const page = await context.newPage();
    await page.goto(`${startedServer.origin}/`);
    held = { server: startedServer, context, guard, page };
  });

  test.afterEach(async () => {
    await held?.context.close();
    held = undefined;
  });

  test("continues a request to an allowed origin to the server", async () => {
    const { guard, page, server } = current();
    const answer = await page.evaluate(
      address => fetch(address).then(response => response.json()),
      `${server.origin}/other?x=1`,
    );
    expect(answer).toBe("ok");
    expect(server.requests()).toContain("GET /other?x=1");
    expect(guard.refused()).toEqual([]);
  });

  test("refuses any other origin and records the origin only", async () => {
    const { guard, page } = current();
    const outcome = await page.evaluate(
      address =>
        fetch(address).then(
          () => "answered",
          () => "refused",
        ),
      `${OFF_LIST}/rpc/${SENTINEL}?key=${SENTINEL}`,
    );
    expect(outcome).toBe("refused");
    // Not the path, not the query: the origin.
    expect(guard.refused()).toEqual([OFF_LIST]);
    // What a failing fixture would print for it.
    const failure = await Promise.resolve()
      .then(() => {
        expect(guard.refused(), "origins outside the allow-list").toEqual([]);
        return "";
      })
      .catch(String);
    expect(failure).toContain(OFF_LIST);
    expect(failure).not.toContain(SENTINEL);
    expect(JSON.stringify(guard.refused())).not.toContain(SENTINEL);
    expect(test.info().attachments).toEqual([]);
    expect(guard.takeRefused()).toEqual([OFF_LIST]);
    expect(guard.refused()).toEqual([]);
  });

  test("matches an origin exactly: another port, scheme, or host is refused", async () => {
    const { guard, page, server } = current();
    const port = Number(new URL(server.origin).port);
    const others = [
      `http://127.0.0.1:${String(port + 1)}`,
      `http://localhost:${String(port)}`,
      `https://127.0.0.1:${String(port)}`,
    ];
    await Promise.all(
      others.map(origin =>
        page.evaluate(url => fetch(url).catch(() => null), `${origin}/`),
      ),
    );
    expect(guard.takeRefused().toSorted()).toEqual(others.toSorted());
  });

  test("connects an allowed WebSocket to the server", async () => {
    const { guard, page, server } = current();
    const state = await socketOutcome(
      page,
      `${server.origin.replace("http:", "ws:")}/socket`,
    );
    expect(state).toBe("opened");
    expect(server.requests()).toContain("UPGRADE /socket");
    expect(guard.refused()).toEqual([]);
  });

  test("closes a disallowed WebSocket with 1008 and records the origin only", async () => {
    const { guard, page } = current();
    const closed = await socketOutcome(
      page,
      `wss://off-list.example.test/socket/${SENTINEL}?key=${SENTINEL}`,
    );
    expect(closed).toBe("closed 1008");
    expect(guard.takeRefused()).toEqual([`websocket ${OFF_LIST}`]);
    // The scan still sees the URL; the record and anything printed never do.
    expect(guard.webSocketUrls().join()).toContain(SENTINEL);
  });

  test("redacts a known secret from a record", async () => {
    const { guard, page } = current();
    guard.addSecretSource(() => [
      { label: "a host", value: "secretive.example.test" },
    ]);
    await page.evaluate(
      address => fetch(address).catch(() => null),
      "https://secretive.example.test/x",
    );
    expect(guard.takeRefused()).toEqual(["https://[redacted]"]);
  });

  test("checks the requests the test makes itself on the same list", () => {
    const { server } = current();
    const allowed = [server.origin];
    expect(() => {
      assertAllowedUrl(allowed, `${server.origin}/verify/v1/rounds/x`);
    }).not.toThrow();
    const refusal = (): unknown => {
      try {
        assertAllowedUrl(
          allowed,
          `${OFF_LIST}/verify/v1/rounds/${SENTINEL}?k=${SENTINEL}`,
        );
      } catch (error: unknown) {
        return error;
      }
      return "no error";
    };
    expect(refusal()).toBeInstanceOf(OriginRefusedError);
    expect(refusal()).toMatchObject({ origin: OFF_LIST });
    expect(String(refusal())).not.toContain(SENTINEL);
  });
});
