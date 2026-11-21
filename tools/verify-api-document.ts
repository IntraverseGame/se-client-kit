// A line reader of the vendored verify API document, for tests only: the
// component schemas' `properties` and `required` lists, read from the YAML's
// fixed indentation (2 spaces a level) without a YAML parser. Shared by
// `tools/verify-api-fields.test.ts` (the readers' fields against the document)
// and `verify-body-maximal.test.ts` (a body with every optional field).

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const verifyApiDocument = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "packages",
    "contracts",
    "src",
    "schemas",
    "verify.v1.openapi.yaml",
  ),
  "utf8",
);

/** The text of schema `name` under `components.schemas` (4-space indent). */
export const schemaText = (name: string): string => {
  const start = verifyApiDocument.indexOf(`\n    ${name}:\n`);
  if (start < 0) throw new Error(`no schema ${name}`);
  const rest = verifyApiDocument.slice(start + 1);
  const end = rest.slice(1).search(/\n {4}[A-Za-z0-9]+:\n/u);
  return end < 0 ? rest : rest.slice(0, end + 1);
};

/** The keys of the `properties` block at `indent` spaces in `text`. */
export const propertiesAt = (
  text: string,
  indent: number,
): readonly string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${" ".repeat(indent)}properties:`);
  if (start < 0) return [];
  const keys: string[] = [];
  const key = new RegExp(`^ {${String(indent + 2)}}([A-Za-z0-9_]+):`, "u");
  for (const line of lines.slice(start + 1)) {
    const indented = line.length - line.trimStart().length;
    if (line.trim() !== "" && indented <= indent) break;
    const match = key.exec(line);
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys.toSorted();
};

/** The names of the flow-style `required: [...]` list at `indent` spaces. */
export const requiredAt = (text: string, indent: number): readonly string[] => {
  const prefix = `${" ".repeat(indent)}required: [`;
  const line = text.split("\n").find(l => l.startsWith(prefix));
  if (line === undefined) return [];
  return line
    .slice(prefix.length, line.lastIndexOf("]"))
    .split(",")
    .map(name => name.trim())
    .filter(name => name !== "")
    .toSorted();
};

/** A top-level schema's properties that its `required` list leaves out. */
export const optionalProperties = (name: string): readonly string[] => {
  const text = schemaText(name);
  const required = requiredAt(text, 6);
  return propertiesAt(text, 6).filter(key => !required.includes(key));
};

/** The document's component schema names that define `properties`. */
export const objectSchemas = (): readonly string[] => {
  const components = verifyApiDocument.slice(
    verifyApiDocument.indexOf("\n  schemas:\n"),
  );
  const names = [...components.matchAll(/\n {4}([A-Za-z0-9]+):\n/gu)].map(
    match => match[1] ?? "",
  );
  return names.filter(name => propertiesAt(schemaText(name), 6).length > 0);
};
