// Calls to the fake Play API from a page, with `fetch`, as the Wrapper makes
// them: for the tests of the harness itself.

import type { Page } from "@playwright/test";

import type { FakePlayApi } from "./fake-play-types.ts";

export type CallInit = {
  readonly method?: "GET" | "POST";
  readonly token?: string;
  readonly body?: unknown;
};

export type CallResult = {
  readonly status: number;
  readonly contentType: string;
  readonly cacheControl: string;
  readonly body: unknown;
};

/** Calls `path` from `page` and reads the answer as JSON. */
export const call = (
  page: Page,
  path: string,
  init: CallInit = {},
): Promise<CallResult> =>
  page.evaluate(
    async ({ path: target, init: options }) => {
      const headers: Record<string, string> = {};
      if (options.token !== undefined) {
        headers["authorization"] = `Bearer ${options.token}`;
      }
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await fetch(target, {
        method: options.method ?? "POST",
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        cacheControl: response.headers.get("cache-control") ?? "",
        body: (await response.json()) as unknown,
      };
    },
    { path, init },
  );

export const tokenOf = (result: CallResult): string =>
  String((result.body as { readonly playToken?: unknown }).playToken);

/** Redeems the fake's launch code and returns the first play token. */
export const openSession = async (
  page: Page,
  fake: FakePlayApi,
): Promise<string> =>
  tokenOf(
    await call(page, "/play/v1/sessions:redeem", {
      body: { launchCode: fake.launchCode },
    }),
  );

/** How a redeem call from the page ended: answered, or a network failure. */
export const redeemOutcome = (page: Page): Promise<string> =>
  page.evaluate(() =>
    fetch("/play/v1/sessions:redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launchCode: "lc_x" }),
    }).then(
      () => "answered",
      (error: unknown) =>
        error instanceof TypeError ? "network failure" : "other",
    ),
  );

/**
 * Starts a redeem call the page can abort with `abortHanging()`, and resolves
 * with how it ended.
 */
export const abortableRedeem = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const controller = new AbortController();
    Reflect.set(globalThis, "abortHanging", () => {
      controller.abort();
    });
    return fetch("/play/v1/sessions:redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launchCode: "lc_x" }),
      signal: controller.signal,
    }).then(
      () => "answered",
      () => "aborted",
    );
  });

export const abortHanging = (page: Page): Promise<void> =>
  page.evaluate(() => {
    (Reflect.get(globalThis, "abortHanging") as () => void)();
  });

/** A round action body the document accepts (values are not checked). */
export const ACTION = {
  idempotencyKey: "e2e-1",
  roundId: "0x01",
  typedData: "AA==",
  signature: `0x${"1".repeat(130)}`,
};
