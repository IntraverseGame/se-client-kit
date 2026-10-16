// Applicator keywords: they apply subschemas, through `context.evaluate`.

import {
  child,
  type Context,
  isJsonObject,
  type JsonObject,
  member,
  quiet,
  report,
  type Resolved,
  type Site,
  stops,
  unescapeToken,
  unsupported,
} from "./site.ts";

const isSchema = (value: unknown): boolean =>
  typeof value === "boolean" || isJsonObject(value);

export const checkProperties = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isJsonObject(value)) {
    return unsupported(site);
  }
  if (!isJsonObject(instance)) {
    return true;
  }
  let valid = true;
  for (const key of Object.keys(value)) {
    if (stops(valid, site)) {
      return false;
    }
    if (
      Object.hasOwn(instance, key) &&
      !context.evaluate(value[key], instance[key], child(site, key, key))
    ) {
      valid = false;
    }
  }
  return valid;
};

export const checkAdditionalProperties = (
  context: Context,
  schema: JsonObject,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isSchema(value)) {
    return unsupported(site);
  }
  if (!isJsonObject(instance)) {
    return true;
  }
  const declared = isJsonObject(schema["properties"])
    ? schema["properties"]
    : {};
  const extra = Object.keys(instance).filter(
    key => !Object.hasOwn(declared, key),
  );
  if (value === false) {
    // One issue at the object: the extra names are document content.
    return extra.length === 0 || report(site, "additionalProperties");
  }
  // Each extra member is evaluated at the object's own location: its name is
  // document content, so it never enters an issue's instancePath.
  const at: Site = {
    schemaPath: site.schemaPath,
    instancePath: site.instancePath,
    issues: site.issues,
  };
  let valid = true;
  for (const key of extra) {
    if (stops(valid, site)) {
      return false;
    }
    if (!context.evaluate(value, instance[key], at)) {
      valid = false;
    }
  }
  return valid;
};

export const checkItems = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!isSchema(value)) {
    return unsupported(site);
  }
  if (!Array.isArray(instance)) {
    return true;
  }
  let valid = true;
  for (const [index, item] of instance.entries()) {
    if (stops(valid, site)) {
      return false;
    }
    if (!context.evaluate(value, item, member(site, String(index)))) {
      valid = false;
    }
  }
  return valid;
};

export const checkAllOf = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!Array.isArray(value) || value.length === 0) {
    return unsupported(site);
  }
  let valid = true;
  for (const [index, subschema] of value.entries()) {
    if (stops(valid, site)) {
      return false;
    }
    if (!context.evaluate(subschema, instance, child(site, String(index)))) {
      valid = false;
    }
  }
  return valid;
};

/** `anyOf` and `oneOf` report one issue at their own location. */
export const checkCombination = (
  context: Context,
  keyword: "anyOf" | "oneOf",
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  if (!Array.isArray(value) || value.length === 0) {
    return unsupported(site);
  }
  let matches = 0;
  for (const [index, subschema] of value.entries()) {
    const at = quiet(child(site, String(index)));
    if (context.evaluate(subschema, instance, at)) {
      matches += 1;
      if (keyword === "anyOf" || matches > 1) {
        break;
      }
    }
  }
  const valid = keyword === "anyOf" ? matches > 0 : matches === 1;
  return valid || report(site, keyword);
};

export const checkNot = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean =>
  !context.evaluate(value, instance, quiet(site)) || report(site, "not");

/** `if` applies `then` or `else`, whose failures are reported as their own. */
export const checkConditional = (
  context: Context,
  schema: JsonObject,
  instance: unknown,
  site: Site,
  parent: Site,
): boolean => {
  const holds = context.evaluate(schema["if"], instance, quiet(site));
  const branch = holds ? "then" : "else";
  return (
    !Object.hasOwn(schema, branch) ||
    context.evaluate(schema[branch], instance, child(parent, branch))
  );
};

/** Resolves `#` and `#/<pointer>` inside the schema document only. */
export const resolveRef = (
  context: Context,
  ref: string,
): Resolved | undefined => {
  if (context.refs.has(ref)) {
    return context.refs.get(ref);
  }
  let resolved: Resolved | undefined;
  if (ref === "#") {
    resolved = { schema: context.root, path: "" };
  } else if (ref.startsWith("#/")) {
    let pointer: string | undefined;
    try {
      pointer = decodeURIComponent(ref.slice(1));
    } catch {
      pointer = undefined;
    }
    let node: unknown = pointer === undefined ? undefined : context.root;
    for (const token of (pointer ?? "").slice(1).split("/")) {
      const key = unescapeToken(token);
      node =
        isJsonObject(node) && Object.hasOwn(node, key) ? node[key] : undefined;
    }
    if (pointer !== undefined && node !== undefined) {
      resolved = { schema: node, path: pointer };
    }
  }
  context.refs.set(ref, resolved);
  return resolved;
};

export const checkRef = (
  context: Context,
  value: unknown,
  instance: unknown,
  site: Site,
): boolean => {
  const target =
    typeof value === "string" ? resolveRef(context, value) : undefined;
  if (target === undefined) {
    return unsupported(site);
  }
  return context.evaluate(target.schema, instance, {
    schemaPath: target.path,
    instancePath: site.instancePath,
    issues: site.issues,
  });
};
