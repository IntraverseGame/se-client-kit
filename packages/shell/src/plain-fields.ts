// Reading a message from another window without running its code: the parsers
// of `se.controller/1` (game-message.ts) and `se.operator/1`
// (operator-protocol.ts) read a message only through the own data properties
// of a plain object, never through a getter, a prototype, or a symbol key.

/** A message's own data properties, by name. */
export type Fields = ReadonlyMap<string, unknown>;

/**
 * The own data properties of a plain object, or `undefined` for anything else
 * (a string, an array, a class instance, an accessor, a symbol key). Reading
 * never runs the sender's code.
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

/** Whether `fields` has exactly the names `names`, no more and no fewer. */
export const hasExactly = (fields: Fields, names: readonly string[]): boolean =>
  fields.size === names.length && names.every(name => fields.has(name));
