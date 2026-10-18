// The no-secret scan (T-13, requirement 3 of the e2e suite). It records, for a
// whole browser context, every place a secret could leave the shell's memory,
// and looks there for every secret the test knows:
//
// - console output: each message's text and its arguments, serialized in the
//   page, and uncaught page errors;
// - URLs: every request's and response's URL, every WebSocket URL (from the
//   hermetic guard, which sees each one), every URL a frame navigated to (the
//   history API included), and each frame's document URL at scan time;
// - storage, read in every frame at scan time: `history.state`,
//   `localStorage`, `sessionStorage`, IndexedDB (every database, store, key,
//   and value), Cache Storage (every request URL and response body), cookies
//   (the context's, so `HttpOnly` ones too, and `document.cookie`), service
//   worker registrations (scope and script URLs), and the origin private file
//   system (every directory and file name, and every file's contents).
//
// A secret is looked for in every form of secret-needles.ts. Strings shaped
// like a launch code or a play token are findings even when the test did not
// register them. A finding names the channel and the secret's label; its detail
// has every secret replaced by `[redacted]`.
//
// Before a scan, every pending random-draw report and console serialization is
// settled. A channel, a frame, or a console argument that cannot be read is an
// `unreadable` finding naming the channel and the error's name (decided
// 2026-10-17). Two excuses, and only these: a `SecurityError` in a frame whose
// origin is "null" (secret-scan-page.ts), and, in WebKit only, an origin
// private file system read that fails with `UnknownError` in a frame where the
// write probe failed too (`isExcusedOpfs`, decided 2026-10-18).
//
// Not covered: request and response bodies (the Play API carries the token in
// a header and secrets in bodies by design), a base64 form of a secret that is
// not aligned with the start of a larger base64 string, workers, and history
// entries other than the current one (no web API lists them; T-13 checks
// going back itself).

import type {
  BrowserContext,
  ConsoleMessage,
  Frame,
  JSHandle,
  Page,
} from "@playwright/test";

import {
  SHAPED_SECRETS,
  contains,
  isShaped,
  needlesOf,
  redact,
  type Secret,
  type SecretSource,
} from "./secret-needles.ts";
import { inPage, type OpfsWrite } from "./secret-scan-page.ts";

export type ScanChannel =
  | "console"
  | "page-error"
  | "request-url"
  | "response-url"
  | "navigation"
  | "document-url"
  | "local-storage"
  | "session-storage"
  | "indexeddb"
  | "cache-storage"
  | "cookie"
  | "service-worker"
  | "websocket-url"
  | "history-state"
  | "origin-private-file-system"
  | "unreadable";

export type Finding = {
  readonly channel: ScanChannel;
  /** The secret's label, never its value. */
  readonly secret: string;
  /** Where it was found, with every secret redacted. */
  readonly detail: string;
};

export type SecretScanOptions = {
  /** Secrets that become known during the test, read at scan time. */
  readonly sources: readonly SecretSource[];
  /** Settles what is still on its way (the random draws) before a scan. */
  readonly settle: () => Promise<void>;
  /** Every WebSocket URL opened (the hermetic guard sees each one). */
  readonly webSocketUrls: () => readonly string[];
};

export type SecretScan = {
  readonly addSecret: (label: string, value: string | Uint8Array) => void;
  /**
   * The one navigation the test itself makes to a launch URL, which carries the
   * launch code in its fragment by design (W-1): that navigation is not a
   * finding, once. The document URL afterwards still is.
   */
  readonly allowLaunchNavigation: (url: string) => void;
  readonly findings: () => Promise<readonly Finding[]>;
  /** Fails, naming every finding, unless the scan finds nothing. */
  readonly expectClean: () => Promise<void>;
};

type Recorded = {
  readonly channel: ScanChannel;
  readonly where: string;
  readonly text: string;
  /** For an unreadable origin private file system: the write probe. */
  readonly opfsWrite?: OpfsWrite;
};

/**
 * WebKit's OPFS excuse: WebKit, the OPFS channel, `UnknownError`, and a write
 * probe in the same frame that failed too. Anything else stays a finding.
 */
export const isExcusedOpfs = (
  browserName: string | undefined,
  entry: Readonly<Recorded>,
): boolean =>
  browserName === "webkit" &&
  entry.channel === "unreadable" &&
  entry.where === "origin-private-file-system" &&
  entry.text === "UnknownError" &&
  entry.opfsWrite === "failed";

const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

/** A channel that could not be read: a finding on its own, never a value. */
const unreadable = (where: string, error: unknown): readonly Recorded[] => [
  { channel: "unreadable", where, text: errorName(error) },
];

const serializeArgument = (argument: JSHandle): Promise<readonly Recorded[]> =>
  argument
    .evaluate(inPage, "value")
    .catch((error: unknown) => unreadable("console argument", error));

const readFrame = async (frame: Frame): Promise<readonly Recorded[]> => {
  const url: Recorded = {
    channel: "document-url",
    where: "frame",
    text: frame.url(),
  };
  try {
    const global = await frame.evaluateHandle(() => globalThis);
    const stored = await global.evaluate(inPage, "storage");
    await global.dispose();
    return [url, ...stored];
  } catch (error: unknown) {
    return [url, ...unreadable("frame evaluation", error)];
  }
};

/** Starts recording every channel of `context`; scan with `findings`. */
export const startSecretScan = (
  context: BrowserContext,
  { sources, settle, webSocketUrls }: SecretScanOptions,
): SecretScan => {
  const secrets: Secret[] = [];
  const recorded: Recorded[] = [];
  const browserName = context.browser()?.browserType().name();
  const pending: Promise<void>[] = [];
  const allowedLaunches: string[] = [];

  const record = (channel: ScanChannel, where: string, text: string): void => {
    recorded.push({ channel, where, text });
  };

  const onConsole = (message: ConsoleMessage): void => {
    record("console", `console.${message.type()}`, message.text());
    const where = `console.${message.type()} argument`;
    pending.push(
      (async () => {
        const results = await Promise.all(
          message.args().map(argument => serializeArgument(argument)),
        );
        for (const result of results.flat()) {
          record(
            result.channel,
            result.channel === "console" ? where : result.where,
            result.text,
          );
        }
      })(),
    );
  };

  const watchPage = (page: Page): void => {
    page.on("framenavigated", frame => {
      record("navigation", "frame navigation", frame.url());
    });
  };

  context.on("console", onConsole);
  context.on("weberror", webError => {
    const error = webError.error();
    record("page-error", "uncaught", `${error.message} ${error.stack ?? ""}`);
  });
  context.on("request", request => {
    record("request-url", request.resourceType(), request.url());
  });
  context.on("response", response => {
    record("response-url", String(response.status()), response.url());
  });
  context.on("page", watchPage);
  for (const page of context.pages()) watchPage(page);

  const collect = async (): Promise<readonly Recorded[]> => {
    await settle();
    await Promise.all(pending);
    const frames = context.pages().flatMap(page => page.frames());
    const stored = (
      await Promise.all(frames.map(frame => readFrame(frame)))
    ).flat();
    const cookies = (await context.cookies()).map((cookie): Recorded => ({
      channel: "cookie",
      where: `cookie of ${cookie.domain}`,
      text: `${cookie.name}=${cookie.value}`,
    }));
    const launches = [...allowedLaunches];
    const navigations = recorded.filter(entry => {
      const index =
        entry.channel === "navigation" ? launches.indexOf(entry.text) : -1;
      if (index === -1) return true;
      launches.splice(index, 1);
      return false;
    });
    const sockets = webSocketUrls().map((url): Recorded => ({
      channel: "websocket-url",
      where: "websocket",
      text: url,
    }));
    return [...navigations, ...sockets, ...stored, ...cookies];
  };

  const findings = async (): Promise<readonly Finding[]> => {
    const all = [...secrets, ...sources.flatMap(source => source())];
    const needles = all.map(secret => ({
      label: secret.label,
      needles: needlesOf(secret.value),
    }));
    const everyNeedle = needles.flatMap(entry => entry.needles);
    const out: Finding[] = [];
    for (const entry of await collect()) {
      if (entry.channel === "unreadable") {
        if (isExcusedOpfs(browserName, entry)) continue;
        out.push({
          channel: "unreadable",
          secret: entry.text,
          detail: `${entry.where}: ${entry.text}`,
        });
        continue;
      }
      const detail = (): string =>
        `${entry.where}: ${redact(entry.text, everyNeedle)}`;
      for (const secret of needles) {
        if (secret.needles.some(needle => contains(entry.text, needle))) {
          out.push({
            channel: entry.channel,
            secret: secret.label,
            detail: detail(),
          });
        }
      }
      for (const shaped of SHAPED_SECRETS) {
        if (isShaped(entry.text, shaped.pattern)) {
          out.push({
            channel: entry.channel,
            secret: shaped.label,
            detail: detail(),
          });
        }
      }
    }
    return out;
  };

  return {
    addSecret: (label, value) => {
      secrets.push({ label, value });
    },
    allowLaunchNavigation: url => {
      allowedLaunches.push(url);
    },
    findings,
    expectClean: async () => {
      const found = await findings();
      if (found.length > 0) {
        const lines = found.map(
          f => `- ${f.channel}: ${f.secret} (${f.detail})`,
        );
        throw new Error(
          `the secret scan found ${found.length}:\n${lines.join("\n")}`,
        );
      }
    },
  };
};
