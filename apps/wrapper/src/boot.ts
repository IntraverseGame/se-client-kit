// Boot (specs/wrapper.md, Configuration): the UI shows "loading", the
// environment configuration document is read and validated, and the Wrapper
// either refuses to start (the configuration-error state; nothing is opened or
// signed) or is configured. A document that cannot be reached is read again at
// the slow rate, and at once when the browser comes back online (W-43).
// Once configured, a framed Wrapper refuses to start unless W-49's minimum
// allows its framing (embedding.ts: the configuration-error state, the reason
// code logged, nothing opened); then the session is opened from the launch
// code the entry took out of the URL first (W-1, W-2, W-14) and connected to
// the UI (session-wiring.ts). When no session is opened (a refused
// configuration or framing), the launch code is discarded.

import type {
  Logger,
  PlaySession,
  SessionOpening,
} from "@intraverse/se-client-shell";

import {
  checkEmbedding,
  type EmbeddingContext,
  type EmbeddingVerdict,
} from "./embedding.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import {
  type ConfigFetch,
  loadEnvironmentConfig,
} from "./load-environment-config.ts";
import { type GameWindow, showOpening, wireSession } from "./session-wiring.ts";
import { DEFAULT_POLL_CONFIG } from "./snapshot-poller.ts";
import type { Timers } from "./timers.ts";
import {
  type Connectivity,
  createWrapperApp,
  type WrapperApp,
} from "./wrapper-app.ts";

export type BootOptions = {
  readonly doc: Document;
  readonly host: HTMLElement;
  readonly timers: Timers;
  readonly fetch: ConfigFetch;
  readonly configUrl: string;
  readonly logger: Logger;
  readonly connectivity?: Connectivity;
  readonly copyText?: (text: string) => Promise<void>;
  /**
   * Opens the session for the accepted configuration (the shell's
   * `openPlaySession` over the launch code). Without it, no session is opened.
   */
  readonly openSession?: (config: EnvironmentConfig) => Promise<SessionOpening>;
  /** The page's window, for the game boundary (W-37, W-38). */
  readonly window?: GameWindow;
  /**
   * The page's framing (W-49). With `openSession` and without it, the framing
   * is unknown, and no session is opened (fail closed).
   */
  readonly embedding?: EmbeddingContext;
  /**
   * Discards the sealed launch code, called once when boot opens no session
   * with it (a refused configuration or framing): it is never redeemed.
   */
  readonly discardLaunchCode?: () => void;
};

export type BootResult =
  | {
      readonly kind: "configured";
      readonly app: WrapperApp;
      readonly config: EnvironmentConfig;
      /** The session, when one opened. */
      readonly session?: PlaySession;
    }
  | { readonly kind: "refused"; readonly app: WrapperApp };

/**
 * Boots the Wrapper's UI. Resolves once the configuration is accepted or
 * refused; while it cannot be reached it keeps trying.
 */
export const boot = (options: BootOptions): Promise<BootResult> => {
  const app = createWrapperApp({
    doc: options.doc,
    host: options.host,
    timers: options.timers,
    ...(options.connectivity === undefined
      ? {}
      : { connectivity: options.connectivity }),
    ...(options.copyText === undefined ? {} : { copyText: options.copyText }),
  });
  /** W-49's minimum, checked only where a session would open. */
  const embeddingFor = (config: EnvironmentConfig): EmbeddingVerdict =>
    options.openSession === undefined
      ? { ok: true }
      : options.embedding === undefined
        ? { ok: false, reason: "ancestors-unknown" }
        : checkEmbedding(options.embedding, config.operatorOrigins);
  const openSession = async (
    config: EnvironmentConfig,
  ): Promise<PlaySession | undefined> => {
    const open = options.openSession;
    const { window } = options;
    if (open === undefined || window === undefined) {
      options.discardLaunchCode?.();
      return undefined;
    }
    let opening: SessionOpening;
    try {
      opening = await open(config);
    } catch {
      // The session could not be opened at all: nothing is signed (W-1a).
      opening = { kind: "redeem-failed" };
    }
    const session = showOpening(app, opening);
    if (session !== undefined) {
      wireSession({ app, doc: options.doc, window }, session);
    }
    return session;
  };
  return new Promise(resolve => {
    let waiting: unknown;
    let loading = false;
    let settled = false;
    // The connection came back: read the document again at once (W-43).
    const unsubscribe = options.connectivity?.subscribe(() => {
      if (!settled && options.connectivity?.onLine() === true) {
        void attempt();
      }
    });
    const finish = (result: BootResult): void => {
      // A refused start redeems nothing: the launch code is forgotten.
      if (result.kind === "refused") options.discardLaunchCode?.();
      settled = true;
      unsubscribe?.();
      resolve(result);
    };
    const attempt = async (): Promise<void> => {
      if (loading) {
        return;
      }
      loading = true;
      options.timers.clearTimeout(waiting);
      const result = await loadEnvironmentConfig({
        fetch: options.fetch,
        url: options.configUrl,
        timers: options.timers,
      });
      loading = false;
      switch (result.kind) {
        case "ok": {
          app.configure(result.config);
          const embedding = embeddingFor(result.config);
          if (!embedding.ok) {
            // No redeem, no key, no signature, no game (W-49).
            options.logger.warn("embedding.refused", {
              code: embedding.reason,
            });
            app.block("configuration-error");
            finish({ kind: "refused", app });
            return;
          }
          const session = await openSession(result.config);
          finish({
            kind: "configured",
            app,
            config: result.config,
            ...(session === undefined ? {} : { session }),
          });
          return;
        }
        case "invalid": {
          for (const issue of result.issues) {
            options.logger.warn("config.refused", { code: issue.code });
          }
          break;
        }
        case "unreadable": {
          options.logger.warn(
            "config.unreadable",
            result.status === undefined ? {} : { status: result.status },
          );
          break;
        }
        case "network": {
          options.logger.warn("config.unreachable");
          app.accept({ kind: "network" }, "poll");
          waiting = options.timers.setTimeout(() => {
            void attempt();
          }, DEFAULT_POLL_CONFIG.slowDelayMs);
          return;
        }
        default: {
          break;
        }
      }
      app.block("configuration-error");
      finish({ kind: "refused", app });
    };
    void attempt();
  });
};
