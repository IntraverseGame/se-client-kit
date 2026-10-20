// Test-only: the Wrapper booted as a framed page (T-9a's component cases):
// a fake parent window that records what the Wrapper posts to it, a fake page
// window whose one `message` listener the test drives with events from any
// source and origin, a configuration read the test releases when it wants, a
// switchable online state, and a scripted session that counts its openings
// (and may be held open until the test finishes it). No real window or clock.

import {
  createLogger,
  type LogRecord,
  OPERATOR_SCHEMA,
  type OperatorWindow,
  type SessionOpening,
} from "@intraverse/se-client-shell";

import { boot, type BootResult } from "../boot.ts";
import type { EmbeddingContext } from "../embedding.ts";
import { environmentDocument, SE_ORIGIN } from "./environment.ts";
import { createFakeSession, type FakeSession } from "./fake-session.ts";
import { flush } from "./flush.ts";
import { type ManualTimers, manualTimers } from "./manual-timers.ts";

const ignore = (): void => {};

/** The operator origin the fixture document lists. */
export const OPERATOR = "https://operator.example";

export const HELLO = Object.freeze({ schema: OPERATOR_SCHEMA, type: "hello" });

/** A message the Wrapper posted to the parent, with its target origin. */
export type Posted = {
  readonly message: unknown;
  readonly targetOrigin: string;
};

export type FramedBootOptions = {
  /** `DIRECT` unless given; `null`: the framing is unknown (none is given). */
  readonly embedding?: EmbeddingContext | null;
  /** The platform gives no `window.parent` (the gate's unreachable parent). */
  readonly noParent?: boolean;
  /** The session's opening waits until `finishOpening`. */
  readonly holdOpening?: boolean;
  readonly document?: Readonly<Record<string, unknown>>;
  /** Heights the observer reports, in order, once the gate opens. */
  readonly heights?: (report: (height: number) => void) => void;
};

export type FramedBoot = {
  readonly result: Promise<BootResult>;
  readonly parent: OperatorWindow;
  readonly posted: Posted[];
  readonly timers: ManualTimers;
  readonly records: LogRecord[];
  readonly session: FakeSession;
  readonly host: HTMLElement;
  /** How often the session was opened (a redeem). */
  readonly opened: () => number;
  /** Delivers a `message` event, from the parent and `OPERATOR` by default. */
  readonly send: (
    data: unknown,
    from?: { readonly source?: unknown; readonly origin?: string },
  ) => void;
  /** Answers the configuration read, which waits until then. */
  readonly releaseConfig: () => Promise<void>;
  /** How often the configuration was fetched. */
  readonly fetches: () => number;
  /** The browser reports being back online (W-43's read again). */
  readonly goOnline: () => Promise<void>;
  /** Lets a held opening resolve (`holdOpening`). */
  readonly finishOpening: () => Promise<void>;
  /** How often boot discarded the launch code. */
  readonly discarded: () => number;
};

/** A direct frame with `location.ancestorOrigins` = [OPERATOR]. */
export const DIRECT: EmbeddingContext = Object.freeze({
  framed: true,
  nested: false,
  ancestorOrigins: Object.freeze([OPERATOR]),
});

export const bootFramed = (options: FramedBootOptions = {}): FramedBoot => {
  globalThis.document.body.replaceChildren();
  const host = globalThis.document.createElement("div");
  globalThis.document.body.append(host);
  const posted: Posted[] = [];
  const parent: OperatorWindow = {
    postMessage: (message, targetOrigin) => {
      posted.push({ message: structuredClone(message), targetOrigin });
    },
  };
  const listeners = new Set<(event: MessageEvent) => void>();
  const records: LogRecord[] = [];
  const timers = manualTimers();
  const session = createFakeSession();
  let opened = 0;
  let fetches = 0;
  let discarded = 0;
  const onlineListeners = new Set<() => void>();
  let finish: () => void = ignore;
  const opening = new Promise<void>(resolve => {
    finish = resolve;
  });
  let release: () => void = ignore;
  const configRead = new Promise<void>(resolve => {
    release = resolve;
  });
  const document = options.document ?? environmentDocument();
  const result = boot({
    doc: globalThis.document,
    host,
    timers,
    fetch: async () => {
      fetches += 1;
      await configRead;
      return { ok: true, status: 200, json: () => Promise.resolve(document) };
    },
    configUrl: `${SE_ORIGIN}/environment-config.json`,
    logger: createLogger(record => {
      records.push(record);
    }),
    window: {
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
      origin: SE_ORIGIN,
    },
    ...(options.embedding === null
      ? {}
      : { embedding: options.embedding ?? DIRECT }),
    ...(options.noParent === true ? {} : { parent }),
    connectivity: {
      onLine: () => true,
      subscribe: onChange => {
        onlineListeners.add(onChange);
        return () => onlineListeners.delete(onChange);
      },
    },
    discardLaunchCode: () => {
      discarded += 1;
    },
    ...(options.heights === undefined
      ? {}
      : { observeHeight: options.heights }),
    openSession: async (): Promise<SessionOpening> => {
      opened += 1;
      if (options.holdOpening === true) await opening;
      return { kind: "open", session: session.session };
    },
  });
  return {
    result,
    parent,
    posted,
    timers,
    records,
    session,
    host,
    opened: () => opened,
    send: (data, from = {}) => {
      const event = {
        source: "source" in from ? from.source : parent,
        origin: from.origin ?? OPERATOR,
        data,
      } as unknown as MessageEvent;
      for (const listener of listeners) listener(event);
    },
    releaseConfig: async () => {
      release();
      await flush(20);
    },
    fetches: () => fetches,
    goOnline: async () => {
      for (const listener of onlineListeners) listener();
      await flush(20);
    },
    finishOpening: async () => {
      finish();
      await flush(20);
    },
    discarded: () => discarded,
  };
};

export const WELCOME_POST: Posted = Object.freeze({
  message: { schema: OPERATOR_SCHEMA, type: "welcome" },
  targetOrigin: OPERATOR,
});
