// Test-only: seeded randomness. Never `Math.random`: a failing case replays
// from its seed.

import type { RandomUuid } from "@intraverse/se-client-play-client";
import type { RandomSource } from "@intraverse/se-client-signing";

/** Mulberry32: a small seeded generator of floats in [0, 1). */
export const seededFloats = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** A seeded integer in `0 .. bound - 1`. */
export const seededInts = (seed: number): ((bound: number) => number) => {
  const next = seededFloats(seed);
  return (bound: number): number => Math.floor(next() * bound);
};

export type RecordingRandom = RandomSource & {
  /** A copy of every draw, in order: the signer zeroes the array it got. */
  readonly draws: () => readonly Uint8Array[];
};

/** A seeded random source that keeps a copy of what it returned. */
export const recordingRandom = (seed: number): RecordingRandom => {
  const next = seededInts(seed);
  const draws: Uint8Array[] = [];
  const source = (length: number): Uint8Array => {
    const bytes = Uint8Array.from({ length }, () => next(256));
    draws.push(Uint8Array.from(bytes));
    return bytes;
  };
  return Object.assign(source, { draws: (): readonly Uint8Array[] => draws });
};

/** A random source that yields the given draws in order, then fails. */
export const scriptedRandom = (
  ...draws: readonly Uint8Array[]
): RecordingRandom => {
  let index = 0;
  const given: Uint8Array[] = [];
  const source = (length: number): Uint8Array => {
    const draw = draws[index];
    index += 1;
    if (draw?.length !== length) {
      throw new Error("scripted random source exhausted or wrong length");
    }
    given.push(Uint8Array.from(draw));
    return Uint8Array.from(draw);
  };
  return Object.assign(source, { draws: (): readonly Uint8Array[] => given });
};

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

/** A seeded `crypto.randomUUID` stand-in: version 4 UUIDs. */
export const seededUuids = (seed: number): RandomUuid => {
  const next = seededInts(seed);
  return (): string => {
    const bytes = Uint8Array.from({ length: 16 }, () => next(256));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const text = hex(bytes);
    return [
      text.slice(0, 8),
      text.slice(8, 12),
      text.slice(12, 16),
      text.slice(16, 20),
      text.slice(20),
    ].join("-");
  };
};

/** Every printable form of `bytes` a leak could take. */
export const printedForms = (bytes: Uint8Array): readonly string[] => {
  const lower = hex(bytes);
  return [
    lower,
    lower.toUpperCase(),
    Buffer.from(bytes).toString("base64"),
    Buffer.from(bytes).toString("base64url"),
    Array.from(bytes).join(","),
  ];
};
