// StepsDerive over ShuffleDraw, the SuperEngine fairness kernel, kernelVersion
// 1 (specs/verify-page.md, V-12 check 7), pinned by the public vector sets
// `kernel/public/v1/shuffle-draw`, `kernel/public/v1/steps-derive`, and
// `kernel/public/v1/derive`.

import { keccak256 } from "@intraverse/se-client-signing";

import { KernelError } from "./kernel-error.ts";

/** One step: `n` options, of which `k` lose. */
export type StepTerms = {
  readonly n: number;
  readonly k: number;
};

/** What one step derived. */
export type StepLosers = {
  /** The `k` losing options, ascending. */
  readonly losers: readonly number[];
  /** The `k` draws `u` behind them, in draw order. */
  readonly draws: readonly bigint[];
  /** The counter at which each draw was accepted. */
  readonly acceptedAtCtr: readonly number[];
};

const WORD = 32;
const TWO_256 = 1n << 256n;
/** The largest option count of a step. */
const MAX_OPTIONS = 2 ** 32;

/** The largest `m` ShuffleDraw takes, 2^64 - 1. */
const MAX_M = (1n << 64n) - 1n;

/** A label ShuffleDraw takes: 1 to 32 UTF-8 bytes, none of them zero. */
const isLabel = (bytes: Uint8Array): boolean =>
  bytes.length > 0 && bytes.length <= WORD && !bytes.includes(0);

/** `bytes32(label)`: the label's bytes, then zero bytes up to 32. */
const labelWord = (bytes: Uint8Array): Uint8Array => {
  const word = new Uint8Array(WORD);
  word.set(bytes);
  return word;
};

/** StepsDerive's ShuffleDraw label, `bytes32("steps-v1")`. */
const STEPS_LABEL = labelWord(new TextEncoder().encode("steps-v1"));

/** `uint256(value)`: one big-endian 32-byte word. */
const uintWord = (value: bigint): Uint8Array => {
  const word = new Uint8Array(WORD);
  let rest = value;
  for (let i = WORD - 1; i >= 0 && rest > 0n; i -= 1) {
    word[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return word;
};

const uintOf = (bytes: Uint8Array): bigint =>
  bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);

/**
 * The bound below which a 256-bit hash is accepted as a draw from 0 to m - 1:
 * 2^256 less its remainder by `m`, so each result has exactly as many accepted
 * hashes behind it. `m` is at least 1.
 */
export const drawLimit = (m: bigint): bigint => TWO_256 - (TWO_256 % m);

/**
 * The draw a 256-bit hash `x` gives from 0 to m - 1, or `undefined` when `x` is
 * at or above `drawLimit(m)` and the next try must be hashed.
 */
export const acceptDraw = (x: bigint, m: bigint): bigint | undefined =>
  x < drawLimit(m) ? x % m : undefined;

/** One ShuffleDraw: the draw `u` and the counter `ctr` it was accepted at. */
export type Draw = {
  readonly u: bigint;
  readonly ctr: number;
};

/**
 * The draw itself, over inputs already checked: try `ctr` (from 0) hashes five
 * 32-byte words, the label, the seed, `j`, `t`, and `ctr`, and the first hash
 * `acceptDraw` takes is the draw.
 */
const draw = (
  label: Uint8Array,
  seed: Uint8Array,
  j: bigint,
  t: bigint,
  m: bigint,
): Draw => {
  const preimage = new Uint8Array(WORD * 5);
  preimage.set(label, 0);
  preimage.set(seed, WORD);
  preimage.set(uintWord(j), WORD * 2);
  preimage.set(uintWord(t), WORD * 3);
  for (let ctr = 0; ; ctr += 1) {
    preimage.set(uintWord(BigInt(ctr)), WORD * 4);
    const u = acceptDraw(uintOf(keccak256(preimage)), m);
    if (u !== undefined) return { u, ctr };
  }
};

/**
 * ShuffleDraw(label, seed, j, t, m): a fair draw from 0 to m - 1, as the public
 * set `kernel/public/v1/shuffle-draw` states it. The seed is checked first
 * (`seed-length`), then the label (`label-invalid`), then `m`
 * (`m-out-of-range`). `j` and `t` are `uint256` words: a value outside 0 to
 * 2^256 - 1 is a caller's mistake, refused with a `RangeError`.
 */
export const shuffleDraw = (
  label: string,
  seed: Uint8Array,
  j: bigint,
  t: bigint,
  m: bigint,
): Draw => {
  if (seed.length !== WORD) throw new KernelError("seed-length");
  const bytes = new TextEncoder().encode(label);
  if (!isLabel(bytes)) throw new KernelError("label-invalid");
  if (m < 1n || m > MAX_M) throw new KernelError("m-out-of-range");
  if (j < 0n || j >= TWO_256 || t < 0n || t >= TWO_256) {
    throw new RangeError("j and t must be uint256 values");
  }
  return draw(labelWord(bytes), seed, j, t, m);
};

const isCount = (value: unknown, min: number, max: number): boolean =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;

/** One step's losers by the forward partial Fisher-Yates over its draws. */
const deriveStep = (
  seed: Uint8Array,
  j: number,
  { n, k }: StepTerms,
): StepLosers => {
  // The options start in order. The map holds only the positions whose option
  // has moved, so memory grows with `k`, not with `n` (which may be 2^32).
  const slots = new Map<number, number>();
  const at = (index: number): number => slots.get(index) ?? index;
  const draws: bigint[] = [];
  const acceptedAtCtr: number[] = [];
  for (let t = 0; t < k; t += 1) {
    // Checked by stepsDerive: a 32-byte seed and 1 <= n - t <= 2^32.
    const { u, ctr } = draw(
      STEPS_LABEL,
      seed,
      BigInt(j),
      BigInt(t),
      BigInt(n - t),
    );
    const other = t + Number(u);
    const picked = at(other);
    slots.set(other, at(t));
    slots.set(t, picked);
    draws.push(u);
    acceptedAtCtr.push(ctr);
  }
  const losers = Array.from({ length: k }, (_, t) => at(t)).toSorted(
    (a, b) => a - b,
  );
  return { losers, draws, acceptedAtCtr };
};

/**
 * StepsDerive(seed, steps): for each step `j` (from 0), the `k_j` losers among
 * `n_j` options. The seed is checked first, then every `n`, then every `k`; an
 * empty list derives nothing.
 */
export const stepsDerive = (
  seed: Uint8Array,
  steps: readonly StepTerms[],
): StepLosers[] => {
  if (seed.length !== WORD) throw new KernelError("seed-length");
  if (!steps.every(step => isCount(step.n, 1, MAX_OPTIONS))) {
    throw new KernelError("n-out-of-range");
  }
  // `k` is bounded only by `n` here (each draw is a hash): cap it before the
  // page passes steps taken from untrusted evidence.
  if (!steps.every(step => isCount(step.k, 0, step.n))) {
    throw new KernelError("k-out-of-range");
  }
  return steps.map((step, j) => deriveStep(seed, j, step));
};
