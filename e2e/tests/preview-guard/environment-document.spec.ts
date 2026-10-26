// The environment document check (RFC-002, "Safety"): the document is fetched
// as the Wrapper fetches it (no credentials, no cache, no redirect, 15 s); it is
// refused when `environment` is not `preview`; the API bases are read from the
// document and not derived from the preview origin; an origin off the list is
// refused naming the origin only; and `gameOrigins` must list the shared game
// origin. The pure checks run in every project; the ones that fetch run against
// a local loopback test server, in the Chromium project only.

import { ENVIRONMENT_CONFIG_PATH } from "../harness/environment-config.ts";
import { expect, test } from "../harness/worker-browser.ts";
import {
  checkEnvironmentDocument,
  type FetchLike,
  loadPreviewDocument,
  PreviewSafetyError,
} from "../preview-support/environment-document.ts";
import { OriginRefusedError } from "../preview-support/guard-preview.ts";
import {
  parsePreviewEnvironment,
  type PreviewEnvironment,
} from "../preview-support/preview-environment.ts";
import { startTestServer, type TestServer } from "./loopback-server.ts";

const SENTINEL = "SENTINEL-PROVIDER-KEY";
const GAME_ORIGIN = "https://game.example-games.test";

/** A preview environment whose preview origin is `origin`. */
const environmentAt = (origin: string): PreviewEnvironment =>
  parsePreviewEnvironment({
    SE_E2E_PREVIEW_ORIGIN: origin,
    SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
    SE_E2E_PREVIEW_GAME_ORIGIN: GAME_ORIGIN,
    SE_E2E_PREVIEW_ALLOWED_ORIGINS:
      "https://verify.other-host.test,https://rpc1.example.test,https://rpc2.example.test",
  });

/** A valid `preview` document for a stack whose Play API is on `origin`. */
const documentAt = (origin: string): Record<string, unknown> => ({
  environment: "preview",
  playApiBaseUrl: `${origin}/play/v1`,
  // On another origin than the preview one: read from the document, not derived.
  verifyApiBaseUrl: "https://verify.other-host.test/verify/v1",
  rpcEndpoints: {
    base: [
      { provider: "p1", url: `https://rpc1.example.test/base/${SENTINEL}` },
      { provider: "p2", url: "https://rpc2.example.test/base" },
    ],
  },
  gameOrigins: [GAME_ORIGIN],
});

const ORIGIN = "https://preview.example.test";
const environment = environmentAt(ORIGIN);

const refusal = (document: unknown): unknown => {
  try {
    checkEnvironmentDocument(environment, document);
  } catch (error: unknown) {
    return error;
  }
  return "no error";
};

test.describe("the environment document check", () => {
  test("reads the API bases from the document, not from the preview origin", () => {
    const read = checkEnvironmentDocument(environment, documentAt(ORIGIN));
    expect(read.playApiBaseUrl).toBe(`${ORIGIN}/play/v1`);
    expect(read.verifyApiBaseUrl).toBe(
      "https://verify.other-host.test/verify/v1",
    );
    expect(new URL(read.verifyApiBaseUrl).origin).not.toBe(ORIGIN);
    expect(read.gameOrigins).toEqual([GAME_ORIGIN]);
    expect(read.rpcUrls).toHaveLength(2);
  });

  for (const value of ["production", "local", "staging", "", 1, null]) {
    test(`refuses environment ${JSON.stringify(value)}`, () => {
      const error = refusal({ ...documentAt(ORIGIN), environment: value });
      expect(error).toBeInstanceOf(PreviewSafetyError);
      expect(error).toMatchObject({ check: "environment" });
    });
  }

  test("refuses an origin off the list, naming the origin only", () => {
    const document = {
      ...documentAt(ORIGIN),
      rpcEndpoints: {
        base: [
          {
            provider: "p1",
            url: `https://off-list.example.test/rpc/${SENTINEL}?key=${SENTINEL}`,
          },
        ],
      },
    };
    const error = refusal(document);
    expect(error).toBeInstanceOf(OriginRefusedError);
    expect(error).toMatchObject({ origin: "https://off-list.example.test" });
    expect(String(error)).not.toContain(SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SENTINEL);
  });

  for (const field of ["playApiBaseUrl", "verifyApiBaseUrl"]) {
    test(`refuses a ${field} off the list`, () => {
      const error = refusal({
        ...documentAt(ORIGIN),
        [field]: `https://elsewhere.example.test/x/${SENTINEL}`,
      });
      expect(error).toMatchObject({ origin: "https://elsewhere.example.test" });
      expect(String(error)).not.toContain(SENTINEL);
    });
  }

  test("refuses a document that does not list the shared game origin", () => {
    expect(
      refusal({ ...documentAt(ORIGIN), gameOrigins: ["https://other.test"] }),
    ).toMatchObject({ check: "game-origin" });
    expect(refusal({ ...documentAt(ORIGIN), gameOrigins: [] })).toMatchObject({
      check: "game-origin",
    });
  });

  test("refuses a document that is malformed, without holding it", () => {
    const BAD: readonly unknown[] = [
      null,
      "preview",
      [],
      { environment: "preview" },
      { ...documentAt(ORIGIN), playApiBaseUrl: 3 },
      { ...documentAt(ORIGIN), rpcEndpoints: [] },
      { ...documentAt(ORIGIN), rpcEndpoints: { base: "x" } },
      { ...documentAt(ORIGIN), rpcEndpoints: { base: [{ provider: "p" }] } },
      { ...documentAt(ORIGIN), rpcEndpoints: { base: [{ url: "not a url" }] } },
      { ...documentAt(ORIGIN), gameOrigins: "x" },
    ];
    for (const document of BAD) {
      expect(refusal(document)).toMatchObject({ check: "document" });
    }
  });

  test("fetches as the Wrapper does: no credentials, no cache, no redirect, a bound", async () => {
    const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      seen.push({ url, init });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(documentAt(ORIGIN)),
      });
    };
    await loadPreviewDocument(environment, fetchImpl);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`${ORIGIN}${ENVIRONMENT_CONFIG_PATH}`);
    expect(seen[0]?.init).toMatchObject({
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    expect(seen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("keeps no network error: a failed fetch is only the check", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.reject(new Error(`connect ECONNREFUSED ${SENTINEL}`));
    const error = await loadPreviewDocument(environment, fetchImpl).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ check: "fetch" });
    expect(String(error)).not.toContain(SENTINEL);
    expect((error as Error).cause).toBeUndefined();
  });
});

test.describe("the environment document, fetched from a local server", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "loopback is reachable in the Chromium project only",
  );

  let started: TestServer | undefined;
  const server = (): TestServer => {
    if (started === undefined) throw new Error("the server is not started");
    return started;
  };
  test.beforeAll(async () => {
    started = await startTestServer();
  });
  test.afterAll(async () => {
    await started?.close();
  });

  test("fetches the document, sends no credentials, and reads the API bases from it", async () => {
    const local = environmentAt(server().origin);
    server().serve(ENVIRONMENT_CONFIG_PATH, documentAt(server().origin));
    const read = await loadPreviewDocument(local);
    expect(read.playApiBaseUrl).toBe(`${server().origin}/play/v1`);
    // Not derived from the preview origin it came from.
    expect(read.verifyApiBaseUrl).toBe(
      "https://verify.other-host.test/verify/v1",
    );
    expect(server().requests()).toContain(`GET ${ENVIRONMENT_CONFIG_PATH}`);
    expect(server().credentialHeaders()).toEqual([]);
  });

  test("refuses a production document", async () => {
    const local = environmentAt(server().origin);
    server().serve(ENVIRONMENT_CONFIG_PATH, {
      ...documentAt(server().origin),
      environment: "production",
    });
    await expect(loadPreviewDocument(local)).rejects.toMatchObject({
      check: "environment",
    });
  });

  test("refuses an origin off the list, naming the origin only", async () => {
    const local = environmentAt(server().origin);
    server().serve(ENVIRONMENT_CONFIG_PATH, {
      ...documentAt(server().origin),
      verifyApiBaseUrl: `https://unlisted.example.test/verify/v1/${SENTINEL}`,
    });
    const error = await loadPreviewDocument(local).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ origin: "https://unlisted.example.test" });
    expect(String(error)).not.toContain(SENTINEL);
  });

  test("does not follow a redirect", async () => {
    const local = environmentAt(server().origin);
    server().redirect(
      ENVIRONMENT_CONFIG_PATH,
      `${server().origin}/elsewhere.json`,
    );
    server().serve("/elsewhere.json", documentAt(server().origin));
    await expect(loadPreviewDocument(local)).rejects.toMatchObject({
      check: "fetch",
    });
    expect(server().requests()).not.toContain("GET /elsewhere.json");
  });

  test("refuses an error status", async () => {
    const local = environmentAt(server().origin);
    server().serve(ENVIRONMENT_CONFIG_PATH, { title: "no" }, 503);
    await expect(loadPreviewDocument(local)).rejects.toMatchObject({
      check: "fetch",
    });
  });
});
