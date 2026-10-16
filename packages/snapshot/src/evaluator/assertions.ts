// Assertion keywords: they look at one value and never recurse.

import {
  type Context,
  isJsonObject,
  isNonNegativeInteger,
  isStringArray,
  report,
  type Site,
  unsupported,
} from "./site.ts";

/** JSON Schema counts a string's length in code points, not UTF-16 units. */
const codePointLength = (text: string): number => {
  let length = 0;
  let index = 0;
  while (index < text.length) {
    index += (text.codePointAt(index) ?? 0) > 0xff_ff ? 2 : 1;
    length += 1;
  }
  return length;
};

/**
 * Equality of a schema value (`const`, `enum`) and an instance. The recursion
 * follows the schema value, so its depth is bounded by the schema.
 */
const jsonEqual = (expected: unknown, actual: unknown): boolean => {
  if (expected === null || typeof expected !== "object") {
    return expected === actual;
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item: unknown, index) => jsonEqual(item, actual[index]))
    );
  }
  if (!isJsonObject(expected) || !isJsonObject(actual)) {
    return false;
  }
  const keys = Object.keys(expected);
  return (
    keys.length === Object.keys(actual).length &&
    keys.every(
      key =>
        Object.hasOwn(actual, key) && jsonEqual(expected[key], actual[key]),
    )
  );
};

const TYPES: Readonly<Record<string, (instance: unknown) => boolean>> = {
  null: instance => instance === null,
  boolean: instance => typeof instance === "boolean",
  object: instance => isJsonObject(instance),
  array: instance => Array.isArray(instance),
  string: instance => typeof instance === "string",
  number: instance => typeof instance === "number" && Number.isFinite(instance),
  integer: instance =>
    typeof instance === "number" && Number.isInteger(instance),
};

export const checkType = (
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  const names = typeof value === "string" ? [value] : value;
  if (
    !isStringArray(names) ||
    names.length === 0 ||
    !names.every(name => Object.hasOwn(TYPES, name))
  ) {
    return unsupported(site);
  }
  return (
    names.some(name => TYPES[name]?.(instance) === true) || report(site, "type")
  );
};

export const checkConst = (
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => jsonEqual(value, instance) || report(site, "const");

export const checkEnum = (
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!Array.isArray(value)) {
    return unsupported(site);
  }
  return (
    value.some((option: unknown) => jsonEqual(option, instance)) ||
    report(site, "enum")
  );
};

export const checkBound = (
  keyword: "minimum" | "maximum",
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return unsupported(site);
  }
  if (typeof instance !== "number") {
    return true;
  }
  const within = keyword === "minimum" ? instance >= value : instance <= value;
  return within || report(site, keyword);
};

export const checkLength = (
  keyword: "minLength" | "maxLength",
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isNonNegativeInteger(value)) {
    return unsupported(site);
  }
  if (typeof instance !== "string") {
    return true;
  }
  const length = codePointLength(instance);
  const within = keyword === "minLength" ? length >= value : length <= value;
  return within || report(site, keyword);
};

export const checkItemCount = (
  keyword: "minItems" | "maxItems",
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isNonNegativeInteger(value)) {
    return unsupported(site);
  }
  if (!Array.isArray(instance)) {
    return true;
  }
  const count = instance.length;
  const within = keyword === "minItems" ? count >= value : count <= value;
  return within || report(site, keyword);
};

const compilePattern = (
  context: Context,
  source: string,
): RegExp | undefined => {
  if (context.patterns.has(source)) {
    return context.patterns.get(source);
  }
  let compiled: RegExp | undefined;
  try {
    // ECMA-262 regular expressions, as JSON Schema specifies; `u` reads the
    // pattern by code point. A RegExp is not code generation: CSP allows it.
    compiled = new RegExp(source, "u");
  } catch {
    compiled = undefined;
  }
  context.patterns.set(source, compiled);
  return compiled;
};

export const checkPattern = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  const pattern =
    typeof value === "string" ? compilePattern(context, value) : undefined;
  if (pattern === undefined) {
    return unsupported(site);
  }
  return (
    typeof instance !== "string" ||
    pattern.test(instance) ||
    report(site, "pattern")
  );
};

export const checkRequired = (
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isStringArray(value)) {
    return unsupported(site);
  }
  return (
    !isJsonObject(instance) ||
    value.every(key => Object.hasOwn(instance, key)) ||
    report(site, "required")
  );
};

export const checkDependentRequired = (
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (
    !isJsonObject(value) ||
    !Object.values(value).every(entry => isStringArray(entry))
  ) {
    return unsupported(site);
  }
  if (!isJsonObject(instance)) {
    return true;
  }
  const satisfied = Object.entries(value).every(
    ([key, dependencies]) =>
      !Object.hasOwn(instance, key) ||
      (isStringArray(dependencies) &&
        dependencies.every(dependency => Object.hasOwn(instance, dependency))),
  );
  return satisfied || report(site, "dependentRequired");
};
