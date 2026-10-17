// A JSON Schema (draft 2020-12) evaluator for the keyword profile that the
// vendored `se.snapshot/1` schema uses, and nothing more. It interprets the
// schema as data: no code is generated or compiled at run time (no `eval`, no
// `new Function`), so it runs under a Content Security Policy without
// `unsafe-eval` (ADR-001, decision 6).
//
// Fail closed: a keyword outside the profile, a malformed keyword value, or a
// `$ref` that does not resolve inside the document is a validation failure,
// never a silent pass. The evaluator never throws on any input; an unexpected
// exception (a non-JSON value such as a throwing getter or a proxy) is reported
// as one failure with the keyword `evaluation`.
//
// Issues carry locations only (JSON Pointers into the document and into the
// schema) and the failing keyword, never a value from the document, so an issue
// is safe to log (specs/wrapper/rendering-from-the-snapshot.md, W-28).

import {
  checkAdditionalProperties,
  checkAllOf,
  checkCombination,
  checkConditional,
  checkItems,
  checkNot,
  checkProperties,
  checkRef,
  resolveRef,
} from "./applicators.ts";
import {
  checkBound,
  checkConst,
  checkDependentRequired,
  checkEnum,
  checkItemCount,
  checkLength,
  checkPattern,
  checkRequired,
  checkType,
} from "./assertions.ts";
import {
  child,
  type Context,
  isJsonObject,
  type JsonObject,
  report,
  type Site,
  stops,
  unsupported,
  type ValidationIssue,
} from "./site.ts";

export type { ValidationIssue };

/**
 * Evaluates a value against the subschema that `ref` (`#` or `#/...`) names and
 * returns the failed keywords in evaluation order; none when it is valid.
 */
export type Evaluator = (
  ref: string,
  instance: unknown,
) => readonly ValidationIssue[];

/** Keywords that only annotate: they never fail. */
const ANNOTATIONS: ReadonlySet<string> = new Set([
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "title",
  "description",
]);

/** Every keyword the evaluator understands (the profile). */
export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  ...ANNOTATIONS,
  "$ref",
  "type",
  "const",
  "enum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "required",
  "properties",
  "additionalProperties",
  "dependentRequired",
  "items",
  "minItems",
  "maxItems",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
]);

const checkKeyword = (
  context: Context,
  schema: JsonObject,
  keyword: string,
  instance: unknown,
  parent: Site,
): boolean => {
  const value = schema[keyword];
  const site = child(parent, keyword);
  if (ANNOTATIONS.has(keyword)) {
    return true;
  }
  switch (keyword) {
    case "$ref": {
      return checkRef(context, value, instance, site);
    }
    case "type": {
      return checkType(value, instance, site);
    }
    case "const": {
      return checkConst(value, instance, site);
    }
    case "enum": {
      return checkEnum(value, instance, site);
    }
    case "minimum":
    case "maximum": {
      return checkBound(keyword, value, instance, site);
    }
    case "minLength":
    case "maxLength": {
      return checkLength(keyword, value, instance, site);
    }
    case "pattern": {
      return checkPattern(context, value, instance, site);
    }
    case "required": {
      return checkRequired(value, instance, site);
    }
    case "dependentRequired": {
      return checkDependentRequired(value, instance, site);
    }
    case "minItems":
    case "maxItems": {
      return checkItemCount(keyword, value, instance, site);
    }
    case "properties": {
      return checkProperties(context, value, instance, site);
    }
    case "additionalProperties": {
      return checkAdditionalProperties(context, schema, value, instance, site);
    }
    case "items": {
      return checkItems(context, value, instance, site);
    }
    case "allOf": {
      return checkAllOf(context, value, instance, site);
    }
    case "anyOf":
    case "oneOf": {
      return checkCombination(context, keyword, value, instance, site);
    }
    case "not": {
      return checkNot(context, value, instance, site);
    }
    case "if": {
      return checkConditional(context, schema, instance, site, parent);
    }
    case "then":
    case "else": {
      // Applied by `if`; without an `if` they have no effect.
      return true;
    }
    default: {
      return unsupported(site);
    }
  }
};

/**
 * The keywords of one schema object in evaluation order: schema order, except
 * that `not` comes last. A `not` reports one issue at the object itself, so a
 * sibling keyword that names a member (such as `properties` rejecting a field
 * where it sits) reports first, as the vectors' `failsAt` pointers expect.
 */
const evaluationOrder = (schema: JsonObject): readonly string[] => {
  const keywords = Object.keys(schema);
  return [
    ...keywords.filter(keyword => keyword !== "not"),
    ...keywords.filter(keyword => keyword === "not"),
  ];
};

const evaluate = (
  context: Context,
  schema: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (schema === true) {
    return true;
  }
  if (schema === false) {
    return report(site, "false");
  }
  if (!isJsonObject(schema)) {
    return unsupported(site);
  }
  let valid = true;
  for (const keyword of evaluationOrder(schema)) {
    if (stops(valid, site)) {
      return false;
    }
    if (!checkKeyword(context, schema, keyword, instance, site)) {
      valid = false;
    }
  }
  return valid;
};

/**
 * An evaluator over one schema document. Compiled patterns and resolved
 * references are cached per evaluator.
 */
export const createEvaluator = (root: unknown): Evaluator => {
  const context: Context = {
    root,
    patterns: new Map(),
    refs: new Map(),
    evaluate: (schema, instance, site) =>
      evaluate(context, schema, instance, site),
  };
  return (ref, instance) => {
    const issues: ValidationIssue[] = [];
    try {
      const target = resolveRef(context, ref);
      if (target === undefined) {
        return [{ instancePath: "", schemaPath: "", keyword: "unsupported" }];
      }
      evaluate(context, target.schema, instance, {
        schemaPath: target.path,
        instancePath: "",
        issues,
      });
    } catch {
      // Unreachable for JSON input; a non-JSON value (a throwing getter, a
      // proxy) or a `$ref` loop fails closed instead of throwing.
      return [{ instancePath: "", schemaPath: "", keyword: "evaluation" }];
    }
    return issues;
  };
};
