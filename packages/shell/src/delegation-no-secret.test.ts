// T-44's "nothing stored" (W-11, W-12, W-73): a whole delegation (begin, the
// request, the vector's answer registered, a delegated start, the session's
// end) touches no storage, cookie, URL, history, network global, or service
// worker, adds no global, and no state, answer, or printed session carries the
// signature or the session id; only `registered` carries the wallet.

import { inspect } from "node:util";

import { afterEach, beforeEach, expect, it } from "vitest";

import {
  ACCEPTED,
  answered,
  carrying,
  openDelegated,
} from "./fixtures/delegation.ts";
import { ok } from "./fixtures/fake-play.ts";
import { sessionOf } from "./fixtures/play-session.ts";
import { issueRound } from "./fixtures/round-auth.ts";
import { reread } from "./fixtures/round-edits.ts";

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
  "cookieStore",
] as const;

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
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
});

const printed = (value: unknown): string =>
  [
    JSON.stringify(value) ?? "",
    inspect(value, { depth: Infinity, showHidden: true }),
  ].join("\n");

it("a whole delegation stores nothing and prints no signature or session id", async () => {
  const globalsBefore = new Set(Reflect.ownKeys(globalThis));
  const opened = await openDelegated();
  const session = sessionOf(opened);
  const texts: string[] = [];
  session.onDelegation(state => texts.push(printed(state)));
  answered(session);
  texts.push(printed(session.delegationOffer()), printed(session.delegation()));
  opened.play.answer(
    "startRound",
    ok(reread(issueRound().snapshot, carrying())),
  );
  // The answer is the round's Snapshot, whose public evidence carries the
  // delegation (W-72): it is not one of the texts checked here.
  await session.start({ value: "100", unit: "EUR" });
  texts.push(printed(session.round()), printed(session));
  session.end();
  texts.push(printed(session.delegation()));
  const all = texts.join("\n").toLowerCase();
  for (const value of [
    ACCEPTED.signature.slice(2, 40),
    ACCEPTED.sessionId,
    ACCEPTED.sessionIdBytes32.slice(2, 34),
  ]) {
    expect(all).not.toContain(value.toLowerCase());
  }
  expect(touched).toEqual([]);
  const added = Reflect.ownKeys(globalThis).filter(
    key => !globalsBefore.has(key),
  );
  expect(added).toEqual([]);
});
