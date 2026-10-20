// The fake operator page of T-9a: a page on the operator's origin (listed or
// not) that embeds the Wrapper's launch URL in an iframe and runs the
// operator side of `se.operator/1` as the spec's operator guidance says: it
// posts `hello` to the iframe's window, with `targetOrigin` the SE origin, on
// the iframe's `load` and then every 250 ms until `welcome` arrives; it reads
// only messages whose source is that window and whose origin is the SE
// origin; and it sizes the iframe from `resize`. Everything it received is kept
// for the test. Also: serving the release bundle's page with a
// `frame-ancestors` header, and scanning texts for the session's secrets.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BrowserContext, Frame, Page } from "@playwright/test";

import { serveEnvironmentConfig } from "./environment-config.ts";
import { frameNamed } from "./frames.ts";
import { OPERATOR_ORIGIN, WRAPPER_DIST, WRAPPER_ORIGIN } from "./origins.ts";
import {
  contains,
  needlesOf,
  SHAPED_SECRETS,
  type SecretSource,
} from "./secret-needles.ts";

export type EmbedOptions = {
  /** The operator page's origin; the listed one by default. */
  readonly origin?: string;
  /** Whether the page runs the handshake (`hello` until `welcome`). */
  readonly hello?: boolean;
  /** The iframe's `referrerpolicy` attribute, if any. */
  readonly referrerPolicy?: string;
  /** Embeds through a same-origin page in between (not supported, W-49a). */
  readonly nested?: boolean;
};

/** The fake operator's lobby and deposit pages, for the Snapshot's links. */
export const OPERATOR_LINKS = {
  lobby: `${OPERATOR_ORIGIN}/lobby.html`,
  deposit: `${OPERATOR_ORIGIN}/deposit.html`,
} as const;

/**
 * Opens the operator page and embeds `launchUrl` (the launch code in its
 * fragment), without waiting for the Wrapper's frame: a frame the browser
 * refused (`frame-ancestors`) may never be one Playwright can name.
 */
export const startEmbedding = async (
  page: Page,
  launchUrl: string,
  options: EmbedOptions = {},
): Promise<void> => {
  await page.goto(`${options.origin ?? OPERATOR_ORIGIN}/index.html`);
  await page.evaluate(
    async ({ url, seOrigin, hello, referrerPolicy, nested }) => {
      const state = { received: [] as unknown[], loads: 0 };
      Object.assign(globalThis, { operatorState: state });
      let host = document;
      if (nested) {
        const middle = document.createElement("iframe");
        middle.title = "Page in between";
        middle.src = "/index.html";
        const loaded = new Promise(resolve => {
          middle.addEventListener("load", resolve, { once: true });
        });
        document.body.append(middle);
        await loaded;
        host = middle.contentDocument ?? document;
      }
      const frame = host.createElement("iframe");
      frame.name = "wrapper";
      frame.title = "Wrapper";
      if (referrerPolicy !== undefined) {
        frame.setAttribute("referrerpolicy", referrerPolicy);
      }
      let welcomed = false;
      let timer: ReturnType<typeof setInterval> | undefined;
      globalThis.addEventListener("message", event => {
        if (event.source !== frame.contentWindow) return;
        if (event.origin !== seOrigin) return;
        const data: unknown = event.data;
        state.received.push(data);
        const message = data as { type?: unknown; height?: unknown };
        if (message.type === "welcome") welcomed = true;
        if (message.type === "resize" && typeof message.height === "number") {
          frame.style.height = `${String(message.height)}px`;
        }
      });
      const sayHello = (): void => {
        frame.contentWindow?.postMessage(
          { schema: "se.operator/1", type: "hello" },
          seOrigin,
        );
      };
      frame.addEventListener("load", () => {
        state.loads += 1;
        if (!hello) return;
        // Each load is a new Wrapper that needs a hello.
        welcomed = false;
        clearInterval(timer);
        sayHello();
        timer = setInterval(() => {
          if (welcomed) {
            clearInterval(timer);
          } else {
            sayHello();
          }
        }, 250);
      });
      frame.src = url;
      host.body.append(frame);
    },
    {
      url: launchUrl,
      seOrigin: WRAPPER_ORIGIN,
      hello: options.hello ?? true,
      referrerPolicy: options.referrerPolicy,
      nested: options.nested === true,
    },
  );
};

/** `startEmbedding`, then the Wrapper's frame. */
export const embedWrapper = async (
  page: Page,
  launchUrl: string,
  options: EmbedOptions = {},
): Promise<Frame> => {
  await startEmbedding(page, launchUrl, options);
  return frameNamed(page, "wrapper");
};

/** Every message the operator page accepted from the Wrapper, in order. */
export const operatorReceived = (page: Page): Promise<readonly unknown[]> =>
  page.evaluate(
    () =>
      (globalThis as unknown as { operatorState: { received: unknown[] } })
        .operatorState.received,
  );

/** Serves `document` with `operatorOrigins` listing the fake operator only. */
export const serveListing = (
  context: BrowserContext,
  document: Readonly<Record<string, unknown>>,
): Promise<void> =>
  serveEnvironmentConfig(context, {
    ...document,
    operatorOrigins: [OPERATOR_ORIGIN],
  });

/** How often the Wrapper's iframe fired `load` on the operator page. */
export const wrapperLoads = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (globalThis as unknown as { operatorState: { loads: number } })
        .operatorState.loads,
  );

/**
 * Serves the Wrapper's page with `Content-Security-Policy: frame-ancestors`
 * listing `origins`, as a host would (W-49's primary control). Registered after
 * the static origin, so it takes the page.
 */
export const serveWithFrameAncestors = async (
  context: BrowserContext,
  origins: readonly string[],
): Promise<void> => {
  const body = await readFile(join(WRAPPER_DIST, "index.html"));
  await context.route(
    url =>
      url.origin === WRAPPER_ORIGIN &&
      (url.pathname === "/" || url.pathname === "/index.html"),
    route =>
      route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": `frame-ancestors ${origins.join(" ")}`,
        },
        body,
      }),
  );
};

/** The labels of the secrets (or secret shapes) any of `texts` holds. */
export const secretsIn = (
  texts: readonly string[],
  sources: readonly SecretSource[],
): readonly string[] => {
  const secrets = sources.flatMap(source => source());
  const found = new Set<string>();
  for (const text of texts) {
    for (const secret of secrets) {
      if (needlesOf(secret.value).some(needle => contains(text, needle))) {
        found.add(secret.label);
      }
    }
    for (const { label, pattern } of SHAPED_SECRETS) {
      if (text.match(pattern) !== null) found.add(label);
    }
  }
  return [...found];
};
