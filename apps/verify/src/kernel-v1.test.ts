// VT-2 (specs/verify-page.md): Seed and SeedHash against the fairness kernel's
// public vector set `kernel/public/v1/seed`, and the round secret's commitment
// (check 5) against `kernel/public/v1/round-secret-hash`.

import { describe, expect, it } from "vitest";

import { field, vectorsOf } from "./fixtures/kernel-vectors.ts";
import { bytesFromHex, hexFromBytes } from "./hex.ts";
import { KernelError } from "./kernel-error.ts";
import { roundSecretHashOf, seedHashOf, seedOf } from "./kernel-v1.ts";

const bytes = (hex: string): Uint8Array => {
  const value = bytesFromHex(hex);
  if (value === undefined) throw new TypeError(`not hex: ${hex}`);
  return value;
};

const errorOf = async (call: () => Promise<unknown>): Promise<string> => {
  try {
    await call();
  } catch (error) {
    if (error instanceof KernelError) return error.code;
    throw error;
  }
  return "no error";
};

const seedSet = vectorsOf("seed");

describe("kernel/public/v1/seed", () => {
  it("has the vendored set's 11 vectors, 6 of them errors", () => {
    expect(seedSet).toHaveLength(11);
    expect(seedSet.filter(v => v.error !== undefined)).toHaveLength(6);
  });

  it.each(seedSet.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "%s: the seed and its hash",
    async (_, vector) => {
      const seed = await seedOf(
        bytes(field(vector.input, "blockValue", vector.id)),
        bytes(field(vector.input, "secret", vector.id)),
      );
      expect(hexFromBytes(seed)).toBe(
        field(vector.expected, "seed", vector.id),
      );
      expect(hexFromBytes(await seedHashOf(seed))).toBe(
        field(vector.expected, "seedHash", vector.id),
      );
    },
  );

  it.each(seedSet.filter(v => v.error !== undefined).map(v => [v.id, v]))(
    "%s: refused with the vector's error",
    async (_, vector) => {
      const call = (): Promise<Uint8Array> =>
        seedOf(
          bytes(field(vector.input, "blockValue", vector.id)),
          bytes(field(vector.input, "secret", vector.id)),
        );
      expect(await errorOf(call)).toBe(vector.error);
    },
  );
});

const commitmentSet = vectorsOf("round-secret-hash");

describe("kernel/public/v1/round-secret-hash", () => {
  it("has the vendored set's 9 vectors, 3 of them errors", () => {
    expect(commitmentSet).toHaveLength(9);
    expect(commitmentSet.filter(v => v.error !== undefined)).toHaveLength(3);
  });

  it.each(commitmentSet.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "%s: SHA-256 over the secret's raw 32 bytes",
    async (_, vector) => {
      const secret = bytes(field(vector.input, "secret", vector.id));
      expect(hexFromBytes(await roundSecretHashOf(secret))).toBe(
        field(vector.expected, "roundSecretHash", vector.id),
      );
    },
  );

  it.each(commitmentSet.filter(v => v.error !== undefined).map(v => [v.id, v]))(
    "%s: refused with the vector's error",
    async (_, vector) => {
      const secret = bytes(field(vector.input, "secret", vector.id));
      expect(await errorOf(() => roundSecretHashOf(secret))).toBe(vector.error);
    },
  );

  it.each(seedSet.filter(v => v.error === undefined).map(v => [v.id, v]))(
    "is the hash %s pins for SeedHash, both SHA-256 of 32 bytes",
    async (_, vector) => {
      const seed = bytes(field(vector.expected, "seed", vector.id));
      expect(hexFromBytes(await roundSecretHashOf(seed))).toBe(
        field(vector.expected, "seedHash", vector.id),
      );
    },
  );

  it.each([0, 31, 33])(
    "refuses a secret, or a seed, of %s bytes",
    async length => {
      const value = new Uint8Array(length);
      expect(await errorOf(() => roundSecretHashOf(value))).toBe(
        "secret-length",
      );
      expect(await errorOf(() => seedHashOf(value))).toBe("seed-length");
    },
  );
});
