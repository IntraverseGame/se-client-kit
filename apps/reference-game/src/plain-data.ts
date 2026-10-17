// Reading untrusted data from another window without running its code: only
// the own data properties of a plain object or a dense array are read (never a
// getter, a proxy trap, or a symbol key), and every value is checked by type.

export type Fields = ReadonlyMap<string, unknown>;

/**
 * The own data properties of a plain object, or `undefined` for anything else
 * (a string, an array, a class instance, an accessor, a symbol key).
 */
export const plainFields = (value: unknown): Fields | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(descriptors).length > 0) return undefined;
    const fields = new Map<string, unknown>();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    // A proxy that throws is not a plain object.
    return undefined;
  }
};

/** Whether `fields` has all of `required`, and nothing outside `allowed`. */
export const hasFields = (
  fields: Fields,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean =>
  required.every(name => fields.has(name)) &&
  [...fields.keys()].every(
    name => required.includes(name) || optional.includes(name),
  );

export const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const isMultiplier = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === "string" && allowed.includes(value as T);

/** The items of a dense array, read without running a getter. */
export const arrayItems = (value: unknown): readonly unknown[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      return undefined;
    }
    const items: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[index];
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      items.push(descriptor.value);
    }
    return items;
  } catch {
    return undefined;
  }
};

export const optionalIndexBelow = (
  value: unknown,
  limit: number,
): value is number | undefined =>
  value === undefined || (isIndex(value) && value < limit);
