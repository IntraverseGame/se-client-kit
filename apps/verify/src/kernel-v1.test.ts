// VT-2 (specs/verify-page.md): Seed and SeedHash against the fairness kernel's
// public vector set `kernel/public/v1/seed`, and `roundSecretHash` against its
// definition, SHA-256(roundSecret), which no kernel vector pins yet.

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

describe("roundSecretHash = SHA-256(roundSecret)", () => {
  it("is SHA-256 of the secret's raw 32 bytes, not of its text", async () => {
    const zeros = new Uint8Array(32);
    expect(hexFromBytes(await roundSecretHashOf(zeros))).toBe(
      "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    );
  });

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
