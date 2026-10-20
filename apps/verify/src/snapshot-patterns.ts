// The Snapshot schema's string patterns, read from the vendored schema in
// `contracts` (runtime entry), never retyped: `RoundId`, `Hash32`, `Address`,
// and the like (V-4, and the evidence's validation).

import { snapshotSchema } from "@intraverse/se-client-contracts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The compiled `pattern` of the schema's `$defs` entry `name`. */
export const snapshotPattern = (name: string): RegExp => {
  const defs = snapshotSchema["$defs"];
  const definition = isRecord(defs) ? defs[name] : undefined;
  const pattern = isRecord(definition) ? definition["pattern"] : undefined;
  if (typeof pattern !== "string") {
    throw new TypeError(`the Snapshot schema has no ${name} pattern`);
  }
  return new RegExp(pattern, "u");
};

/** The compiled `pattern` of property `property` of the `$defs` entry `name`. */
export const snapshotPropertyPattern = (
  name: string,
  property: string,
): RegExp => {
  const defs = snapshotSchema["$defs"];
  const definition = isRecord(defs) ? defs[name] : undefined;
  const properties = isRecord(definition)
    ? definition["properties"]
    : undefined;
  const field = isRecord(properties) ? properties[property] : undefined;
  const pattern = isRecord(field) ? field["pattern"] : undefined;
  if (typeof pattern !== "string") {
    throw new TypeError(
      `the Snapshot schema has no ${name}.${property} pattern`,
    );
  }
  return new RegExp(pattern, "u");
};
