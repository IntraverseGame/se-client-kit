// The seeded random source of the e2e suite (T-13): `crypto.getRandomValues` is
// replaced in every page and frame with Playwright's `addInitScript`, so the
// unmodified release bundle runs and the suite still knows every byte it drew,
// the action key's included. Each draw is reported to the test through a
// binding and kept in memory only. Every document starts the stream from the
// seed again, so a reload draws the same bytes as the first load.
//
// What the stub does not reach: workers (an init script runs only in pages and
// frames) and `crypto.randomUUID`, which the test plan leaves unstubbed.
//
// A test may script one draw (`ScriptedDraw`): the first draw of its length in
// each document of its origin is its bytes instead of the seeded ones. The
// round tests give the Wrapper's key draw the signed-action vector's public
// test key this way (round-play.ts), read at run time and never written to a
// file. The scripted draw is reported like any other, so the secret scan
// treats it as the action key it is.

import type { BrowserContext, Frame } from "@playwright/test";

import type { SecretSource } from "./secret-needles.ts";

/** The binding the stub reports each draw to. */
const BINDING = "__seE2eRandomDraw";

/** The page's count of its draws, as `[document id, count]`. */
const COUNT = "__seE2eRandomDrawCount";

/** The length of a draw that may be the action key (T-3: 32 bytes). */
export const KEY_DRAW_BYTES = 32;

/** How many round trips a page's reports may take to arrive. */
const SETTLE_ROUNDS = 50;

export type RandomDraws = {
  /** Every draw so far, in order of arrival, as the page received it. */
  readonly draws: () => readonly Uint8Array[];
  /**
   * Waits until every draw that every live page and frame has made is reported.
   * Fails if one never arrives.
   */
  readonly settled: () => Promise<void>;
};

/** One draw a test scripts: the first of its length in a document of `origin`. */
export type ScriptedDraw = {
  readonly origin: string;
  readonly bytes: readonly number[];
};

type StubArgs = {
  readonly seed: number;
  readonly binding: string;
  readonly count: string;
  readonly scripted: ScriptedDraw | null;
};

// Runs in the page: no reference to anything outside its own body.
const installStub = ({ seed, binding, count, scripted }: StubArgs): void => {
  // mulberry32: a small seeded generator, never Math.random.
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const documentId = performance.timeOrigin;
  let drawn = 0;
  let scriptedLeft =
    scripted !== null && globalThis.location.origin === scripted.origin;
  Object.defineProperty(globalThis, count, {
    value: (): readonly [number, number] => [documentId, drawn],
  });
  const original = Crypto.prototype.getRandomValues;
  const stub = <T extends ArrayBufferView | null>(array: T): T => {
    // The platform's own checks (null, type, quota) still apply and throw.
    original.call(globalThis.crypto, array as ArrayBufferView<ArrayBuffer>);
    if (array === null) return array;
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    if (
      scriptedLeft &&
      scripted !== null &&
      scripted.bytes.length === bytes.length
    ) {
      scriptedLeft = false;
      bytes.set(scripted.bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = next() & 0xff;
      }
    }
    drawn += 1;
    const report: unknown = Reflect.get(globalThis, binding);
    if (typeof report === "function") {
      void (report as (id: number, values: readonly number[]) => Promise<void>)(
        documentId,
        Array.from(bytes),
      );
    }
    return array;
  };
  Object.defineProperty(Crypto.prototype, "getRandomValues", {
    value: stub,
    configurable: true,
    writable: true,
  });
};

const countOf = (frame: Frame): Promise<readonly [number, number] | null> =>
  frame
    .evaluate(name => {
      const read: unknown = Reflect.get(globalThis, name);
      return typeof read === "function"
        ? (read as () => readonly [number, number])()
        : null;
    }, COUNT)
    // A frame that went away has no draws left to wait for.
    .catch(() => null);

/**
 * Installs the seeded `getRandomValues` in every page of `context`, with one
 * draw scripted when `scripted` is given.
 */
export const stubRandomValues = async (
  context: BrowserContext,
  seed: number,
  scripted?: ScriptedDraw,
): Promise<RandomDraws> => {
  const draws: Uint8Array[] = [];
  const received = new Map<Frame, Map<number, number>>();
  const receivedIn = (frame: Frame, documentId: number): number =>
    received.get(frame)?.get(documentId) ?? 0;

  await context.exposeBinding(
    BINDING,
    ({ frame }, documentId: number, values: readonly number[]) => {
      draws.push(Uint8Array.from(values));
      const counts = received.get(frame) ?? new Map<number, number>();
      counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
      received.set(frame, counts);
    },
  );
  await context.addInitScript(installStub, {
    seed,
    binding: BINDING,
    count: COUNT,
    scripted: scripted ?? null,
  });

  const settleFrame = async (frame: Frame): Promise<void> => {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each round trip lets more reports arrive
      const count = await countOf(frame);
      if (count === null || receivedIn(frame, count[0]) >= count[1]) return;
    }
    throw new Error("a random draw of the page was never reported");
  };

  return {
    draws: () => [...draws],
    settled: async () => {
      const frames = context.pages().flatMap(page => page.frames());
      await Promise.all(frames.map(frame => settleFrame(frame)));
    },
  };
};

/** Every 32-byte draw so far, as a secret: each may be the action key. */
export const keyDrawSecrets =
  (draws: RandomDraws): SecretSource =>
  () =>
    draws
      .draws()
      .filter(draw => draw.length === KEY_DRAW_BYTES)
      .map((value, index) => ({
        label: `32-byte random draw ${index}`,
        value,
      }));
