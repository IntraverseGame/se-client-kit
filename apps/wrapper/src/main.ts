// The browser entry of the Wrapper: it wires the platform (DOM, `fetch`,
// timers, the online state, the clipboard, the console) into `boot`. Nothing
// here reads or holds a credential.

import { createLogger, type LogRecord } from "@intraverse/se-client-shell";

import { boot } from "./boot.ts";
import { ENVIRONMENT_CONFIG_PATH } from "./load-environment-config.ts";
import { platformTimers } from "./timers.ts";

// The console shows `warn` and above, as redacted records (W-4, Observability).
const sink = (record: LogRecord): void => {
  if (record.level === "error") {
    console.error(record);
  } else {
    console.warn(record);
  }
};

const host = document.querySelector<HTMLElement>("#app");
if (host !== null) {
  void boot({
    doc: document,
    host,
    timers: platformTimers(globalThis),
    fetch: (url, init) => globalThis.fetch(url, init),
    configUrl: new URL(ENVIRONMENT_CONFIG_PATH, document.baseURI).href,
    logger: createLogger(sink),
    connectivity: {
      onLine: (): boolean => navigator.onLine,
      subscribe: (onChange: () => void): (() => void) => {
        globalThis.addEventListener("online", onChange);
        globalThis.addEventListener("offline", onChange);
        return (): void => {
          globalThis.removeEventListener("online", onChange);
          globalThis.removeEventListener("offline", onChange);
        };
      },
    },
    copyText: (text: string): Promise<void> =>
      navigator.clipboard.writeText(text),
  });
}
