// T-9 and W-38, in the style of no-secret.test.ts: a session signs a move
// through a pick use case while the bridge forwards every Snapshot of the
// round, `signature/` vectors with `proofs.createRoundAuth` included. Nothing
// the game receives holds the key's bytes, the token, the key's address, a
// signed action's signature or digest, an idempotency key, or a proof, and the
// bridge touches no messaging, storage, or network global.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PickOutcome } from "./controller-bridge.ts";
import { action, createFakeGame, HELLO, mount } from "./fixtures/fake-game.ts";
import { flush } from "./fixtures/fake-locks.ts";
import {
  printedForms,
  type RecordingRandom,
  recordingRandom,
} from "./fixtures/seeded.ts";
import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import {
  signatureVectors,
  snapshot,
  type WorkedAction,
  workedActions,
} from "./fixtures/vectors.ts";
import { REDACTED, revealSecret, sealSecret } from "./redaction.ts";

const WATCHED = [
  "postMessage",
  "addEventListener",
  "parent",
  "top",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document",
  "location",
  "fetch",
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

const firstMove = (): WorkedAction => {
  const [first] = workedActions;
  if (first === undefined) throw new Error("no worked action");
  return first;
};

const keyOf = (random: RecordingRandom): Uint8Array => {
  const [key] = random.draws();
  if (key === undefined) throw new Error("no key was drawn");
  return key;
};

describe("no secret reaches the game", () => {
  it("the game receives no key, token, signature, or proof (W-38)", async () => {
    const random = recordingRandom(7);
    const session = await openTestSession({ random });
    const round = openWorkedRound(session);
    const token = sealSecret("play-token", TOKEN_TEXT);
    const signed: { readonly signature: string; readonly digest: string }[] =
      [];
    const move = firstMove();
    const authorizations: string[] = [];
    const game = createFakeGame({
      // The use case closes over the shell's round and the play token, as the
      // move flow will (it reveals the token for the request's header): the
      // bridge sees only the outcome, never the signed action or the token.
      pick: (): Promise<PickOutcome> => {
        authorizations.push(`Bearer ${revealSecret(token)}`);
        signed.push(
          round.sign({ kind: move.kind, action: move.action, path: move.path }),
        );
        return Promise.resolve({ accepted: true });
      },
    });
    const bridge = mount(game);
    game.send(HELLO);
    bridge.sendSnapshot(snapshot("active", { step: 0 }));
    game.send(action("pick-1", 0, 0));
    await flush();
    for (const vector of signatureVectors) {
      bridge.sendSnapshot({ ...vector.snapshot, version: 50 });
    }
    bridge.sendSnapshot({ ...snapshot("won"), version: 60 });
    const address = session.address().toLowerCase().slice(2);
    session.end();

    expect(signed).toHaveLength(1);
    expect(game.posted.length).toBeGreaterThan(signatureVectors.length);
    const text = game.posted.map(p => JSON.stringify(p.message)).join("\n");
    for (const form of printedForms(keyOf(random))) {
      expect(text).not.toContain(form);
    }
    // The token text was live in the use case while the bridge ran.
    expect(authorizations).toEqual([`Bearer ${TOKEN_TEXT}`]);
    expect(text).not.toContain(TOKEN_TEXT);
    // No redacting value (a secret, a session, a round) was serialized into a
    // message either.
    expect(text).not.toContain(REDACTED);
    expect(text.toLowerCase()).not.toContain(address);
    for (const { signature, digest } of signed) {
      expect(text).not.toContain(signature.slice(2));
      expect(text).not.toContain(digest.slice(2));
    }
    expect(text).not.toMatch(
      /createRoundAuth|signature|signer|idempotencyKey|sessionId|proofs/u,
    );
    expect(touched).toEqual([]);
  });
});
