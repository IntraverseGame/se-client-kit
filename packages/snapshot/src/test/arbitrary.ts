// A seeded source of arbitrary JSON values for the property tests. The seed is
// fixed by the test, so a run is reproducible; no clock and no platform
// randomness.

/** A deterministic pseudo-random source in [0, 1) (mulberry32). */
export type Random = () => number;

export const seededRandom = (seed: number): Random => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const integerBelow = (random: Random, bound: number): number =>
  Math.floor(random() * bound);

export const pick = <T>(random: Random, options: readonly [T, ...T[]]): T =>
  options[integerBelow(random, options.length)] ?? options[0];

/** Names that the schema uses, plus hostile ones, so objects reach deep rules. */
const KEYS = [
  "schema",
  "version",
  "presentation",
  "model",
  "context",
  "status",
  "closeReason",
  "roundId",
  "bet",
  "step",
  "currentMultiplier",
  "bankedAmount",
  "payout",
  "config",
  "proofs",
  "kind",
  "steps",
  "draw",
  "value",
  "decimals",
  "unit",
  "code",
  "retryable",
  "snapshot",
  "__proto__",
  "constructor",
  "toString",
  "",
  "~/",
] as const;

const STRINGS = [
  "",
  "se.snapshot/1",
  "steps",
  "playback",
  "book",
  "config",
  "idle",
  "active",
  "won",
  "expired",
  "0",
  "007",
  "-1",
  "1e3",
  "115792089237316195423570985008687907853269984665640564039457584007913129639936",
  "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d\n",
  "https://example.com/ x",
  "\u0000",
  "\uD800",
  "😀",
  "ROUND_ACTIVE",
] as const;

const NUMBERS = [
  0,
  -0,
  1,
  -1,
  0.5,
  2 ** 53,
  2 ** 53 + 2,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.MIN_VALUE,
  77,
  78,
  400,
  599,
] as const;

const randomString = (random: Random): string => {
  if (random() < 0.6) {
    return pick(random, STRINGS);
  }
  const length = integerBelow(random, 12);
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCodePoint(
      random() < 0.8
        ? 0x20 + integerBelow(random, 0x5f)
        : integerBelow(random, 0x1_00_00),
    );
  }
  return text;
};

/** An arbitrary JSON value of bounded depth. */
export const arbitraryJson = (random: Random, depth = 4): unknown => {
  const roll = random();
  if (depth <= 0 || roll < 0.35) {
    const scalar = integerBelow(random, 4);
    if (scalar === 0) {
      return null;
    }
    if (scalar === 1) {
      return random() < 0.5;
    }
    if (scalar === 2) {
      return random() < 0.5
        ? pick(random, NUMBERS)
        : (random() - 0.5) * 10 ** integerBelow(random, 30);
    }
    return randomString(random);
  }
  if (roll < 0.6) {
    return Array.from({ length: integerBelow(random, 5) }, () =>
      arbitraryJson(random, depth - 1),
    );
  }
  // Built from JSON text, so `__proto__` becomes an own key as JSON.parse
  // makes it, not a prototype change.
  const entries = Array.from(
    { length: integerBelow(random, 6) },
    () =>
      `${JSON.stringify(random() < 0.8 ? pick(random, KEYS) : randomString(random))}:${JSON.stringify(arbitraryJson(random, depth - 1))}`,
  );
  return JSON.parse(`{${entries.join(",")}}`) as unknown;
};

const isContainer = (
  value: unknown,
): value is Record<string, unknown> | unknown[] =>
  typeof value === "object" && value !== null;

/**
 * A copy of a JSON document with one random change: a value replaced, a key
 * removed, or a key added, somewhere along a random path.
 */
export const mutateJson = (random: Random, document: unknown): unknown => {
  const copy = JSON.parse(JSON.stringify(document)) as unknown;
  if (!isContainer(copy)) {
    return arbitraryJson(random);
  }
  let node: Record<string, unknown> | unknown[] = copy;
  for (;;) {
    const keys = Object.keys(node);
    const key = keys[integerBelow(random, keys.length)];
    const next =
      key === undefined ? undefined : (node as Record<string, unknown>)[key];
    if (key === undefined || !isContainer(next) || random() < 0.25) {
      const action = integerBelow(random, 3);
      const target = node as Record<string, unknown>;
      if (action === 0 && key !== undefined) {
        target[key] = arbitraryJson(random, 2);
      } else if (action === 1 && key !== undefined && !Array.isArray(node)) {
        Reflect.deleteProperty(target, key);
      } else if (Array.isArray(node)) {
        node.push(arbitraryJson(random, 2));
      } else {
        Object.defineProperty(target, pick(random, KEYS), {
          value: arbitraryJson(random, 2),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return copy;
    }
    node = next;
  }
};
