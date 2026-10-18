// What the proofs of the Firefox and WebKit block share
// (hermetic-proxy.spec.ts, hermetic-webrtc.spec.ts): which browsers have it,
// the launch options each project must have, and a browser of the test's own,
// started through the start lock like every browser of the suite
// (browser-start.ts), with the project's block or a control's changes.

import type { Browser, LaunchOptions } from "@playwright/test";

import { DEAD_PROXY, FIREFOX_BLOCK_PREFS } from "./browser-flags.ts";
import { startBrowser } from "./browser-start.ts";
import { applyContextBlocks } from "./context-blocks.ts";

export type BlockedBrowser = "firefox" | "webkit";

/** The project's browser, which the proofs never run as Chromium. */
export const blockedBrowser = (name: string): BlockedBrowser => {
  if (name === "firefox" || name === "webkit") return name;
  throw new Error(
    `${name} has no dead-proxy block: the test should be skipped`,
  );
};

/** The launch options each project must have: the block, and nothing else. */
export const BLOCK: Readonly<Record<BlockedBrowser, LaunchOptions>> = {
  firefox: { proxy: DEAD_PROXY, firefoxUserPrefs: FIREFOX_BLOCK_PREFS },
  webkit: { proxy: DEAD_PROXY },
};

/**
 * The launch options a test may change from the project's; `proxy: undefined`
 * drops the project's proxy, for a control.
 */
export type Overrides = Omit<LaunchOptions, "proxy"> & {
  readonly proxy?: LaunchOptions["proxy"] | undefined;
};

export type BrowserTypes = Readonly<
  Record<
    BlockedBrowser,
    { readonly launch: (options: LaunchOptions) => Promise<Browser> }
  >
>;

/**
 * A browser of the test's own, through the start lock. It has the project's
 * launch options, the block included, unless `options` replaces some (`proxy:
 * undefined` drops the proxy), and every context it makes gets the block's
 * context-level part (context-blocks.ts) unless `contextBlocks` is false, for a
 * control.
 */
export const launch = async (
  playwright: BrowserTypes,
  browserName: BlockedBrowser,
  options: Overrides = {},
  { contextBlocks = true }: { readonly contextBlocks?: boolean } = {},
): Promise<Browser> => {
  const browser = await startBrowser(timeout =>
    // Playwright spreads these over the project's options, so a `proxy` given
    // as `undefined` drops the project's proxy; LaunchOptions cannot say
    // `undefined` under exactOptionalPropertyTypes, hence the assertion.
    playwright[browserName].launch({ ...options, timeout } as LaunchOptions),
  );
  return contextBlocks ? applyContextBlocks(browser, browserName) : browser;
};

/** Firefox with WebRTC back on and no proxy, the rest kept: a control. */
export const FIREFOX_WEBRTC_ON: Overrides = {
  proxy: undefined,
  firefoxUserPrefs: {
    ...FIREFOX_BLOCK_PREFS,
    "media.peerconnection.enabled": true,
  },
};
