// The page's states (V-3 to V-11) and the controller that moves between them.
// It owns no DOM: a view shows each state, and every effect (`fetch`, the
// timers, the address bar, the browser's offline flag) is injected, so the
// tests are hermetic. The page is in exactly one state at a time; a read that
// a newer one replaced is dropped, never shown.

import type { ChainReadClock } from "./chain-read.ts";
import type { VerifyConfig } from "./environment-config.ts";
import { loadEnvironmentConfig } from "./load-config.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { normalizeRoundId, parseRoute, roundUrl } from "./round-id.ts";
import {
  createVerifyApi,
  type VerifyApi,
  type VerifyApiResult,
} from "./verify-api.ts";
import { type RoundReport, verifyRound } from "./verify-round.ts";

export type PageState =
  /** The configuration is being read; nothing else is known yet. */
  | { readonly kind: "starting" }
  /**
   * V-3: the configuration could not be read or is invalid; no round request.
   * `retryable` when the document could not be fetched or read (a network
   * failure, a non-document answer): the player may try again. An invalid
   * document is not retryable.
   */
  | { readonly kind: "config-error"; readonly retryable: boolean }
  /** V-4: the form; `error` when `text` is not a round id. */
  | { readonly kind: "form"; readonly text: string; readonly error: boolean }
  /** V-5: the API read or the chain read is in flight. */
  | { readonly kind: "loading"; readonly roundId: string }
  /** V-6 to V-8: the page's own checks, with its verdict. */
  | { readonly kind: "report"; readonly report: RoundReport }
  /** V-9: the API has no such round. */
  | { readonly kind: "not-found"; readonly roundId: string }
  /** V-10: an error status, or a body that does not validate. */
  | { readonly kind: "api-error"; readonly roundId: string }
  /** V-11: no answer; `offline` when the browser reports being offline. */
  | {
      readonly kind: "unreachable";
      readonly roundId: string;
      readonly offline: boolean;
    };

/**
 * Shows a state. `focus` is true only when the state follows the player's own
 * action (a submit, a retry): focus then moves to its heading (V-14).
 */
export type PageView = {
  readonly show: (state: PageState, focus: boolean) => void;
};

/** The address bar, injected. */
export type PageLocation = {
  /** The current path, e.g. `/verify/rounds/{roundId}`. */
  readonly pathname: () => string;
  /** Adds a same-origin entry to the history without loading the page. */
  readonly push: (url: string) => void;
  /** Loads another page (a `verifyBaseUrl` on another origin). */
  readonly assign: (url: string) => void;
};

export type PageDeps = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
  /** The page's own origin. */
  readonly origin: string;
  /** The environment configuration document's URL (V-3). */
  readonly configUrl: string;
  readonly location: PageLocation;
  /** `navigator.onLine === false` (V-11). */
  readonly isOffline: () => boolean;
  /** The verify API port; defaults to `createVerifyApi` (tests inject one). */
  readonly api?: (config: VerifyConfig) => VerifyApi;
  /** The checks of V-12; defaults to `verifyRound` (tests inject one). */
  readonly verify?: (
    config: VerifyConfig,
    evidence: RoundEvidence,
    asked: string,
  ) => Promise<RoundReport>;
};

export type VerifyPage = {
  /** Reads the configuration, then shows the state the address asks for. */
  readonly start: () => Promise<void>;
  /** The form's submit (V-4). */
  readonly submit: (text: string) => Promise<void>;
  /**
   * "Check again" or "Try again" (V-3, V-7, V-8, V-10, V-11): reads the round
   * again, or the configuration again when it could not be loaded.
   */
  readonly retry: () => Promise<void>;
  /** The address changed (back, forward): show what it asks for. */
  readonly route: () => Promise<void>;
};

const defaultApi =
  (deps: PageDeps) =>
  (config: VerifyConfig): VerifyApi =>
    createVerifyApi({
      fetch: deps.fetch,
      clock: deps.clock,
      baseUrl: config.verifyApiBaseUrl,
    });

/** Creates the controller. It never throws; every failure is a state. */
export const createVerifyPage = (
  deps: PageDeps,
  view: PageView,
): VerifyPage => {
  let config: VerifyConfig | undefined;
  let api: VerifyApi | undefined;
  let current: string | undefined;
  // True while the configuration could not be loaded and a retry may help.
  let retryableConfigError = false;
  // Each read gets a number; only the newest one may show its result.
  let generation = 0;

  const verify =
    deps.verify ??
    ((cfg: VerifyConfig, evidence: RoundEvidence, asked: string) =>
      verifyRound(
        { fetch: deps.fetch, clock: deps.clock },
        cfg,
        evidence,
        asked,
      ));

  const read = async (roundId: string, focus: boolean): Promise<void> => {
    if (api === undefined || config === undefined) return;
    generation += 1;
    const mine = generation;
    current = roundId;
    view.show({ kind: "loading", roundId }, focus);
    let answer: VerifyApiResult;
    try {
      answer = await api.readRound(roundId);
    } catch {
      // The port should not throw; if it does, it is an error, not a hang.
      answer = { kind: "error" };
    }
    if (mine !== generation) return;
    let state: PageState;
    switch (answer.kind) {
      case "found": {
        let report: RoundReport;
        try {
          report = await verify(config, answer.evidence, roundId);
        } catch {
          // The checks should not throw; if they do, nothing is claimed.
          if (mine !== generation) return;
          view.show({ kind: "api-error", roundId }, focus);
          return;
        }
        if (mine !== generation) return;
        state = { kind: "report", report };
        break;
      }
      case "not-found":
        state = { kind: "not-found", roundId };
        break;
      case "error":
        state = { kind: "api-error", roundId };
        break;
      default:
        // "unreachable"
        state = { kind: "unreachable", roundId, offline: deps.isOffline() };
        break;
    }
    view.show(state, focus);
  };

  const showForm = (text: string, error: boolean, focus: boolean): void => {
    generation += 1;
    current = undefined;
    view.show({ kind: "form", text, error }, focus);
  };

  const route = async (focus: boolean): Promise<void> => {
    if (config === undefined) return;
    const basePath = new URL(config.verifyBaseUrl).pathname;
    const target = parseRoute(deps.location.pathname(), basePath);
    if (target.kind === "form") {
      showForm(target.text ?? "", target.text !== undefined, focus);
      return;
    }
    await read(target.roundId, focus);
  };

  const begin = async (focus: boolean): Promise<void> => {
    view.show({ kind: "starting" }, focus);
    const loaded = await loadEnvironmentConfig({
      fetch: deps.fetch,
      clock: deps.clock,
      url: deps.configUrl,
      ownOrigin: deps.origin,
    });
    retryableConfigError = loaded.kind !== "ok" && loaded.kind !== "invalid";
    if (loaded.kind !== "ok") {
      view.show(
        { kind: "config-error", retryable: retryableConfigError },
        focus,
      );
      return;
    }
    config = loaded.config;
    api = (deps.api ?? defaultApi(deps))(loaded.config);
    await route(focus);
  };

  return {
    start: () => begin(false),
    submit: async text => {
      if (config === undefined) return;
      const roundId = normalizeRoundId(text);
      if (roundId === undefined) {
        // The field keeps the player's text and its error; focus stays there.
        showForm(text, true, false);
        return;
      }
      const url = roundUrl(config.verifyBaseUrl, roundId);
      if (new URL(url).origin !== deps.origin) {
        deps.location.assign(url);
        return;
      }
      // The same round again (e.g. a not-found round's form) adds no entry.
      if (new URL(url).pathname !== deps.location.pathname()) {
        deps.location.push(url);
      }
      await read(roundId, true);
    },
    retry: async () => {
      // No configuration yet: only a retryable configuration error offers
      // this, and it starts again (an invalid document never does).
      if (config === undefined) {
        if (retryableConfigError) await begin(true);
        return;
      }
      if (current === undefined) return;
      await read(current, true);
    },
    route: () => route(false),
  };
};
