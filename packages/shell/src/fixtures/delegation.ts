// Test-only: the wallet delegation's tests (T-44, T-45). The vendored
// `key-delegation/v1` vectors, read from `contracts`' test-only entry at run
// time: the accepted vector's wallet, signature, session, and expiry, and its
// refused high-`s` and `v` forms. Its action key is the `signed-action/`
// vectors' public test key (anvil account 3, never funded), which a session
// draws here from a scripted random source: its bytes are read from the vector
// at run time and never written into a file. A fake signing window records
// what is posted to it, and the session is opened on the manual clock, whose
// fixture time is before the vector's expiry (1795000000), already past in
// real time.

import {
  keyDelegationVectors,
  snapshotVectors,
} from "@intraverse/se-client-contracts/testing";
import type { PlayResponse } from "@intraverse/se-client-play-client";

import type { ExpectedDelegation } from "../delegation-check.ts";
import {
  DELEGATION_SCHEMA,
  type DelegationReady,
} from "../delegation-protocol.ts";
import type { DelegationEvent, DelegationWindow } from "../delegation-types.ts";
import type { PlaySession } from "../session-types.ts";
import {
  GAME,
  type Opened,
  type Overrides,
  open,
  sessionOf,
  TOKEN,
} from "./play-session.ts";
import type { RoundParts } from "./round-auth.ts";
import { scriptedRandom } from "./seeded.ts";
import { hex, type Json, record, text, vectorInput } from "./vectors.ts";

/** The signing page's origin the tests configure. */
export const SIGNER = "https://signer.example.org";

const list = (value: unknown, where: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new TypeError(`fixture: ${where}`);
  return value;
};

const integer = (parent: Json, key: string, where: string): number => {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`fixture: ${where}.${key} is not an integer`);
  }
  return value;
};

const root = record(keyDelegationVectors.v1, "key-delegation/v1");
const accepted = record(list(root["accepted"], "accepted")[0], "accepted[0]");
const start = record(accepted["start"], "accepted[0].start");
const body = record(accepted["keyDelegation"], "accepted[0].keyDelegation");
const typedMessage = record(
  record(accepted["typedData"], "accepted[0].typedData")["message"],
  "accepted[0].typedData.message",
);

/** The accepted vector's values, as the shell sends and registers them. */
export type AcceptedVector = {
  readonly wallet: string;
  readonly signature: string;
  readonly expiry: number;
  readonly noticeHash: string;
  readonly noticeId: string;
  readonly notice: string;
  readonly actionKey: string;
  readonly sessionId: string;
  readonly sessionIdBytes32: string;
};

/** The accepted vector, as the shell sends and registers it. */
export const ACCEPTED: AcceptedVector = Object.freeze({
  wallet: text(body, "wallet", "keyDelegation"),
  signature: text(body, "signature", "keyDelegation"),
  expiry: integer(body, "expiry", "keyDelegation"),
  noticeHash: text(body, "noticeHash", "keyDelegation"),
  noticeId: text(accepted, "noticeId", "accepted[0]"),
  notice: text(typedMessage, "notice", "typedData.message"),
  actionKey: text(start, "actionKey", "start"),
  sessionId: text(start, "sessionId", "start"),
  sessionIdBytes32: text(start, "sessionIdBytes32", "start"),
});

/** A refused vector's signature, by name (`high-s twin`, `v as 0`, ...). */
export const refusedSignature = (name: string): string => {
  const found = list(root["refused"], "refused")
    .map((entry, index) => record(entry, `refused[${String(index)}]`))
    .find(entry => entry["name"] === name);
  if (found === undefined) throw new TypeError(`fixture: no refused ${name}`);
  return text(record(found["keyDelegation"], name), "signature", name);
};

/**
 * The `valid/coinflip-active-key-delegation` vector's `proofs.keyDelegation`, a
 * fresh copy a test may edit.
 */
export const carriedObject = (): Record<string, unknown> => ({
  ...record(
    record(
      vectorInput("valid", "coinflip-active-key-delegation")["proofs"],
      "proofs",
    )["keyDelegation"],
    "proofs.keyDelegation",
  ),
});

/** The signed-action test key's bytes, read from the vector at run time. */
const testKeyBytes = (): Uint8Array => {
  const vector = record(
    snapshotVectors.signedAction["coinflip-cancel"],
    "vector",
  );
  const key = text(
    record(vector["testKey"], "testKey"),
    "privateKey",
    "testKey",
  );
  return Uint8Array.from(Buffer.from(key.slice(2), "hex"));
};

/** The vector's session expiry as the redeem answers it (with milliseconds). */
export const VECTOR_EXPIRES_AT: string = new Date(
  ACCEPTED.expiry * 1000,
).toISOString();

/** The redeem answer of the vector's session and expiry. */
const redeemedVector = (): PlayResponse => ({
  status: 200,
  body: {
    sessionId: ACCEPTED.sessionId,
    playToken: TOKEN,
    tokenExpiresAt: "2026-10-16T12:15:00.000Z",
    sessionExpiresAt: VECTOR_EXPIRES_AT,
    gameOrigin: GAME,
  },
  receivedAtMs: 0,
  clockOffsetMs: 0,
});

/**
 * A session of the vector's session and expiry, keyed with the vector's action
 * key, with the signing page configured and pending notices accepted (the
 * vendored list's one notice is `pending`).
 */
export const openDelegated = (overrides: Overrides = {}): Promise<Opened> =>
  open({
    random: scriptedRandom(testKeyBytes()),
    redeem: redeemedVector,
    signingPageOrigin: SIGNER,
    acceptPendingNotices: true,
    ...overrides,
  });

export type FakeWindow = DelegationWindow & {
  /** What was posted, with its `targetOrigin`. */
  readonly posted: readonly {
    readonly message: unknown;
    readonly origin: string;
  }[];
  readonly closes: () => number;
  /** The player closes the window. */
  readonly shut: () => void;
};

export const fakeWindow = (): FakeWindow => {
  const posted: { readonly message: unknown; readonly origin: string }[] = [];
  let closed = false;
  let closes = 0;
  return {
    get closed(): boolean {
      return closed;
    },
    close: () => {
      closes += 1;
      closed = true;
    },
    focus: () => {},
    postMessage: (message, origin) => {
      posted.push({ message, origin });
    },
    posted,
    closes: () => closes,
    shut: () => {
      closed = true;
    },
  };
};

/** A `message` event from `source`. */
export const event = (
  source: unknown,
  data: unknown,
  origin: string = SIGNER,
): DelegationEvent => ({ source, origin, data });

export const READY: DelegationReady = Object.freeze({
  schema: DELEGATION_SCHEMA,
  type: "ready",
});

export const result = (
  signature: string = ACCEPTED.signature,
  wallet: string = ACCEPTED.wallet,
): Json => ({ schema: DELEGATION_SCHEMA, type: "result", wallet, signature });

export const failedAnswer = (reason: string): Json => ({
  schema: DELEGATION_SCHEMA,
  type: "failed",
  reason,
});

/** Begins, answers `ready`, and answers `answer`; returns the window. */
export const answered = (
  session: PlaySession,
  answer: Json = result(),
): FakeWindow => {
  const win = fakeWindow();
  session.beginDelegation(win);
  session.receiveDelegation(event(win, READY));
  session.receiveDelegation(event(win, answer));
  return win;
};

/** A delegated session with the accepted vector registered. */
export const registered = async (
  overrides: Overrides = {},
): Promise<Opened & { readonly session: PlaySession }> => {
  const opened = await openDelegated(overrides);
  const session = sessionOf(opened);
  answered(session);
  if (session.delegation().state !== "registered") {
    throw new TypeError("fixture: the vector did not register");
  }
  return { ...opened, session };
};

/** The `keyDelegation` field of a request's body, if any. */
export const keyDelegationOf = (
  request: { readonly body?: unknown } | undefined,
): unknown =>
  (request?.body as Readonly<Record<string, unknown>> | undefined)?.[
    "keyDelegation"
  ];

/** The delegation the vector's round carries, as the shell expects it. */
export const expectedOf = (
  carried: Json = carriedObject(),
): ExpectedDelegation => ({
  wallet: hex(carried, "wallet", "keyDelegation"),
  actionKey: hex(carried, "actionKey", "keyDelegation"),
  sessionId: hex(carried, "sessionId", "keyDelegation"),
  expiry: integer(carried, "expiry", "keyDelegation"),
  noticeId: text(carried, "noticeId", "keyDelegation"),
  noticeHash: hex(carried, "noticeHash", "keyDelegation"),
  notice: text(carried, "notice", "keyDelegation"),
  signature: hex(carried, "signature", "keyDelegation"),
});

/** An edit that puts the vector's object (edited by `edit`) on the round. */
export const carrying =
  (edit?: (object: Record<string, unknown>) => void) =>
  (parts: RoundParts): void => {
    const object = carriedObject();
    edit?.(object);
    parts.proofs["keyDelegation"] = object;
  };
