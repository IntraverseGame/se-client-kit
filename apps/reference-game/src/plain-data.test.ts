// The readers of untrusted data from another window: they take only own data
// properties of a plain object and the data items of a dense array, so no
// getter runs and nothing outside the data is read.

import { describe, expect, it } from "vitest";

import { arrayItems, plainFields } from "./plain-data.ts";

const withAccessor = <T extends object>(target: T, key: PropertyKey): T => {
  Object.defineProperty(target, key, {
    get: () => 1,
    enumerable: true,
    configurable: true,
  });
  return target;
};

describe("plainFields", () => {
  it("reads the own data properties of a plain object", () => {
    expect(plainFields({ a: 1, b: undefined })).toEqual(
      new Map<string, unknown>([
        ["a", 1],
        ["b", undefined],
      ]),
    );
    expect(plainFields(Object.create(null))).toEqual(new Map());
  });

  it("refuses an object with an accessor, even among data properties", () => {
    expect(plainFields(withAccessor({ a: 1 }, "b"))).toBeUndefined();
  });
});

describe("arrayItems", () => {
  it("reads the items of a dense array", () => {
    expect(arrayItems([1, undefined, "x"])).toEqual([1, undefined, "x"]);
    expect(arrayItems([])).toEqual([]);
  });

  it("refuses a sparse array", () => {
    // oxlint-disable-next-line no-sparse-arrays -- the hole is the case under test
    expect(arrayItems([1, , 3])).toBeUndefined();
    const holes: unknown[] = [];
    holes.length = 2;
    expect(arrayItems(holes)).toBeUndefined();
  });

  it("refuses an array with an accessor item", () => {
    expect(arrayItems(withAccessor([1, 2], 1))).toBeUndefined();
  });

  it("refuses an array with an extra own property", () => {
    expect(arrayItems(Object.assign([1], { extra: 2 }))).toBeUndefined();
    expect(
      arrayItems(Object.assign([1], { [Symbol("x")]: 2 })),
    ).toBeUndefined();
  });

  it("refuses what is not an array", () => {
    expect(arrayItems({ 0: 1, length: 1 })).toBeUndefined();
  });
});
