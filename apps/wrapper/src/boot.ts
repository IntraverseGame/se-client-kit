// Boot (specs/wrapper.md, Configuration): the UI shows "loading", the
// environment configuration document is read and validated, and the Wrapper
// either refuses to start (the configuration-error state; nothing is opened or
// signed) or is configured. A document that cannot be reached is read again at
// the slow rate, and at once when the browser comes back online (W-43).
//
// Opening the session from the launch code (W-1 to W-8) is the next slice: it
// connects the session's Snapshot read to the app (`WrapperApp.connect`).

import type { Logger } from "@intraverse/se-client-shell";

import type { EnvironmentConfig } from "./environment-config.ts";
import {
  type ConfigFetch,
  loadEnvironmentConfig,
} from "./load-environment-config.ts";
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
};

export type BootResult =
  | {
      readonly kind: "configured";
      readonly app: WrapperApp;
      readonly config: EnvironmentConfig;
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
          finish({ kind: "configured", app, config: result.config });
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
