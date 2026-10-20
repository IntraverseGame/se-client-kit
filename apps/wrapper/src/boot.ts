// Boot (specs/wrapper.md, Configuration): the UI shows "loading", the
// environment configuration document is read and validated, and the Wrapper
// either refuses to start (the configuration-error state; nothing is opened or
// signed) or is configured. A document that cannot be reached is read again at
// the slow rate, and at once when the browser comes back online (W-43).
// The page's one `message` listener is installed first, before the document
// is read, so an operator's early `hello` is recorded (operator-gate.ts,
// W-49c). Once configured, the operator gate decides the framing (W-49a) and,
// on a framed page, awaits the `se.operator/1` handshake: a refusal or a
// timeout is the configuration-error state, with the reason code logged and
// nothing opened. Then the lobby and deposit controls are allowed (W-49e), and
// the session is opened from the launch code the entry took out of the URL
// first (W-1, W-2, W-14) and connected to the UI (session-wiring.ts). When no
// session is opened (a refused configuration, framing, or handshake), the
// launch code is discarded.

import type {
  Logger,
  OperatorWindow,
  PlaySession,
  SessionOpening,
} from "@intraverse/se-client-shell";

import { watchBalance } from "./balance-refresh.ts";
import type { Connectivity } from "./connectivity.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import {
  type ConfigFetch,
  loadEnvironmentConfig,
} from "./load-environment-config.ts";
import {
  createOperatorGate,
  type OperatorGate,
  type OperatorGateOptions,
} from "./operator-gate.ts";
import { showOpening, wireSession } from "./session-wiring.ts";
import { DEFAULT_POLL_CONFIG } from "./snapshot-poller.ts";
import type { Timers } from "./timers.ts";
import { createWrapperApp, type WrapperApp } from "./wrapper-app.ts";

/** The page's window: its `message` events and its own origin. */
export type PageWindow = OperatorGateOptions["window"] & {
  /** The Wrapper's own origin, the SE origin. */
  readonly origin: string;
};

export type BootOptions = {
  readonly doc: Document;
  readonly host: HTMLElement;
  readonly timers: Timers;
  readonly fetch: ConfigFetch;
  readonly configUrl: string;
  readonly logger: Logger;
  readonly connectivity?: Connectivity;
  /** Calls back when the page is visible again (RFC-001 Q16). */
  readonly returns?: (onReturn: () => void) => () => void;
  readonly copyText?: (text: string) => Promise<void>;
  /**
   * Opens the session for the accepted configuration (the shell's
   * `openPlaySession` over the launch code). Without it, no session is opened.
   */
  readonly openSession?: (config: EnvironmentConfig) => Promise<SessionOpening>;
  /** The page's window: one `message` listener (W-38, W-49b), its origin. */
  readonly window: PageWindow;
  /**
   * The page's framing (W-49a). With `openSession` and without it, the framing
   * is unknown, and no session is opened (fail closed).
   */
  readonly embedding?: OperatorGateOptions["embedding"];
  /** `window.parent`, when the page is framed: the operator page (W-49b). */
  readonly parent?: OperatorWindow;
  /** The handshake timeout (W-49c); the shell's 10 s unless given. */
  readonly handshakeTimeoutMs?: number;
  /** Observes the content's height for `resize` (W-49d, height-observer.ts). */
  readonly observeHeight?: (onHeight: (height: number) => void) => void;
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
  // The page visible again: one balance read where no poll runs. Its
  // stop function is not kept: it lives as long as the page, since boot never
  // disposes the app. A state that polls, errs, or is final reads none.
  if (options.returns !== undefined) {
    watchBalance({
      timers: options.timers,
      subscribe: options.returns,
      state: app.state,
      calling: app.calling,
      read: app.readQuiet,
    });
  }
  // Installed before the document is read (W-49c's record, then check).
  const gate = createOperatorGate({
    window: options.window,
    timers: options.timers,
    ...(options.embedding === undefined
      ? {}
      : { embedding: options.embedding }),
    ...(options.parent === undefined ? {} : { parent: options.parent }),
    ...(options.handshakeTimeoutMs === undefined
      ? {}
      : { handshakeTimeoutMs: options.handshakeTimeoutMs }),
    ...(options.observeHeight === undefined
      ? {}
      : { observeHeight: options.observeHeight }),
  });
  const openSession = async (
    config: EnvironmentConfig,
    messages: OperatorGate["messages"],
  ): Promise<PlaySession | undefined> => {
    const open = options.openSession;
    if (open === undefined) {
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
      wireSession(
        { app, doc: options.doc, ownOrigin: options.window.origin, messages },
        session,
      );
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
        ownOrigin: options.window.origin,
        timers: options.timers,
      });
      // An accepted document is final: no later read while the gate waits.
      loading = result.kind === "ok";
      switch (result.kind) {
        case "ok": {
          app.configure(result.config);
          // The gate guards only a session that would open.
          const gated =
            options.openSession === undefined
              ? undefined
              : await gate.open(result.config);
          if (gated?.ok === false) {
            // No redeem, no key, no signature, no game, no control (W-49).
            options.logger.warn("embedding.refused", { code: gated.reason });
            app.block("configuration-error");
            finish({ kind: "refused", app });
            return;
          }
          if (gated !== undefined) app.allowLinks(gated.links);
          const session = await openSession(result.config, gate.messages);
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
