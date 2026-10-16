// T-7a and issue-level acceptance (W-4, W-10 to W-12, W-41): after a whole
// session of signing, refusals, and its end, the key's bytes appear in no log
// line, error, printed object, export, or global, and nothing touches web
// storage, cookies, a URL, or the network.

import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ShellError } from "./errors.ts";
import { createFakeLockManager } from "./fixtures/fake-locks.ts";
import { printedForms, recordingRandom } from "./fixtures/seeded.ts";
import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import { snapshot, workedActions } from "./fixtures/vectors.ts";
import * as api from "./index.ts";
import { createLogger, type LogRecord } from "./logger.ts";
import { sealSecret } from "./redaction.ts";

// What the shell must never touch in this slice: storage, cookies, the URL,
// the history, the network, a service worker, or another window.
const WATCHED = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "document",
  "location",
  "history",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "postMessage",
  "serviceWorker",
] as const;

const TOKEN_TEXT = "fixture-play-token-6f1c2a";

let touched: string[] = [];
let saved: [string, PropertyDescriptor | undefined][] = [];

/** Replaces a global with one that records every read and write. */
const watch = (name: string): void => {
  const record = (): void => {
    touched.push(name);
  };
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: record,
    set: record,
  });
};

beforeEach(() => {
  touched = [];
  saved = WATCHED.map(name => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]);
  for (const name of WATCHED) watch(name);
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

// A module namespace has no prototype, so `String` throws on it.
const asString = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return "";
  }
};

const printed = (value: unknown): string =>
  [
    asString(value),
    JSON.stringify(value) ?? "",
    inspect(value, { depth: Infinity, showHidden: true }),
    inspect(value, { depth: Infinity, showHidden: true, customInspect: false }),
  ].join("\n");

const errorText = (error: unknown): string =>
  [
    printed(error),
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : "",
  ].join("\n");

/** Runs `run` and returns the printed error it throws, if any. */
const thrown = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return errorText(error);
  }
  return "";
};

/** A whole session: sign, resend, refuse, stale, observe, end. */
const wholeSession = async (): Promise<{
  readonly key: Uint8Array;
  readonly texts: readonly string[];
  readonly records: readonly LogRecord[];
}> => {
  const globalsBefore = new Set(Reflect.ownKeys(globalThis));
  const records: LogRecord[] = [];
  const logger = createLogger(record => {
    records.push(record);
  });
  const locks = createFakeLockManager();
  const random = recordingRandom(99);
  const session = await openTestSession({ locks, random });
  const second = await openTestSession({ locks });
  const round = openWorkedRound(session);
  const texts: string[] = [printed(session.address())];
  for (const vector of workedActions.filter(v => v.kind === "action")) {
    const request = {
      kind: vector.kind,
      action: vector.action,
      path: vector.path,
    };
    const action = round.sign(request);
    texts.push(
      printed(round.sign(request)),
      printed(action),
      thrown(() => round.signCancel()),
    );
    round.observe(snapshot("active", { step: vector.sequence }));
  }
  texts.push(thrown(() => second.address()));
  round.stale();
  texts.push(
    thrown(() =>
      round.sign({ kind: "cash-out", action: "cash out", path: [] }),
    ),
  );
  round.observe(snapshot("active", { step: 1 }));
  session.end();
  texts.push(thrown(() => session.address()));
  for (const text of texts.filter(Boolean)) {
    logger.error("session.refused", { cause: new ShellError("equivocation") });
    logger.warn("session.text", { code: text });
  }
  texts.push(printed(session), printed(round), printed(second), printed(api));
  for (const name of Reflect.ownKeys(globalThis)) {
    if (!globalsBefore.has(name)) {
      texts.push(`new global ${String(name)}`);
    }
  }
  texts.push(JSON.stringify(records));
  const [key] = random.draws();
  if (key === undefined) throw new Error("no key was drawn");
  return { key, texts, records };
};

describe("no secret leaves the shell", () => {
  it("the key's bytes appear in no printed value, error, log line, or global", async () => {
    const { key, texts } = await wholeSession();
    const all = texts.join("\n");
    for (const form of printedForms(key)) {
      expect(all).not.toContain(form);
    }
    expect(all).not.toContain("new global");
  });

  it("nothing touches storage, cookies, the URL, or the network", async () => {
    await wholeSession();
    expect(touched).toEqual([]);
  });

  it("a sealed token reaches no log line or error", () => {
    const token = sealSecret("play-token", TOKEN_TEXT);
    const records: LogRecord[] = [];
    const logger = createLogger(record => {
      records.push(record);
    });
    logger.warn("session.refresh", {
      path: `/session/${String(token)}`,
      requestId: token as unknown as string,
      cause: Object.assign(new Error(String(token)), { code: token }),
    });
    expect(JSON.stringify(records)).not.toContain(TOKEN_TEXT);
    expect(errorText(new Error(`${String(token)}`))).not.toContain(TOKEN_TEXT);
  });

  it("every error message is fixed per code", () => {
    const codes = [
      "lock-not-held",
      "session-ended",
      "invalid-input",
      "key-generation",
      "round-exists",
      "equivocation",
      "round-stopped",
      "cancel-unavailable",
    ] as const;
    const messages = codes.map(code => new ShellError(code).message);
    expect(new Set(messages).size).toBe(codes.length);
    expect(messages.join("\n")).not.toMatch(/0x[0-9a-f]{8}/iu);
  });
});
