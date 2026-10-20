// A page controller wired to fakes, for the controller's tests (V-3 to V-11).

import { vi } from "vitest";

import {
  createVerifyPage,
  type PageDeps,
  type PageLocation,
} from "../page-state.ts";
import type { VerifyApi, VerifyApiResult } from "../verify-api.ts";
import type { RoundReport } from "../verify-round.ts";
import {
  configDocument,
  configFetch,
  CONFIG_URL,
  ORIGIN,
  recordingView,
  report,
  ROUND_ID,
  stillClock,
} from "./page.ts";

export const ROUND_PATH = `/verify/rounds/${ROUND_ID}`;

export type Setup = {
  readonly path?: string;
  readonly document?: unknown;
  readonly answers?: readonly VerifyApiResult[];
  readonly offline?: boolean;
  readonly verified?: RoundReport;
  /** Replaces the configuration fetch (e.g. one that fails first). */
  readonly fetch?: typeof fetch;
  readonly verifyThrows?: boolean;
};

export const setup = (options: Setup = {}) => {
  let path = options.path ?? "/verify/";
  const pushed: string[] = [];
  const assigned: string[] = [];
  const location: PageLocation = {
    pathname: () => path,
    push: url => {
      pushed.push(url);
      path = new URL(url).pathname;
    },
    assign: url => {
      assigned.push(url);
    },
  };
  const answers = [...(options.answers ?? [])];
  const readRound = vi.fn<VerifyApi["readRound"]>(() =>
    Promise.resolve(answers.shift() ?? { kind: "error" }),
  );
  const verify = vi.fn<NonNullable<PageDeps["verify"]>>(() =>
    options.verifyThrows === true
      ? Promise.reject(new Error("boom"))
      : Promise.resolve(options.verified ?? report({ kind: "matches" })),
  );
  const net = configFetch(options.document ?? configDocument());
  const view = recordingView();
  const page = createVerifyPage(
    {
      fetch: options.fetch ?? net.fetch,
      clock: stillClock,
      origin: ORIGIN,
      configUrl: CONFIG_URL,
      location,
      isOffline: () => options.offline ?? false,
      api: () => ({ readRound }),
      verify,
    },
    view,
  );
  return { page, view, readRound, verify, pushed, assigned, urls: net.urls };
};

/**
 * A `fetch` that fails every call the way `fail` says until `recover()`, then
 * answers the configuration document.
 */
export const flakyConfigFetch = (
  fail: () => Promise<Response>,
): { readonly fetch: typeof fetch; readonly recover: () => void } => {
  const ok = configFetch();
  let failing = true;
  const fake = (input: RequestInfo | URL, init?: RequestInit) =>
    failing ? fail() : ok.fetch(input, init);
  return {
    fetch: fake as typeof fetch,
    recover: () => {
      failing = false;
    },
  };
};
