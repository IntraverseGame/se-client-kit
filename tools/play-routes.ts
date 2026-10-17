// The literal route table appended to the generated Play API types
// (tools/generate-contracts.ts, specs/client-kit/the-contracts-package.md).

const HTTP_METHODS = "get|put|post|delete|options|head|patch|trace";

/**
 * The `operationRoutes` type appended to the Play API types: each operation's
 * path and method, by `operationId`, read from the generated `paths`. The
 * operation types are structural, so two operations of one shape (a move and a
 * cash-out) cannot be told apart through `paths`; this literal table can. A
 * `paths` member in a shape this reader does not know, an operation without an
 * `operationId`, or one served twice fails the generation.
 */
export const operationRoutes = (source: string): string => {
  const block = /^export type paths = \{\n([\s\S]*?)^\};$/mu.exec(source)?.[1];
  if (block === undefined)
    throw new Error("no `paths` type to read routes from");
  const routes = new Map<string, string>();
  let path: string | undefined;
  for (const line of block.split("\n")) {
    const opened = /^ {2}"(\/[^"]+)": \{$/u.exec(line);
    const method = new RegExp(
      `^ {4}(${HTTP_METHODS}): operations\\["([A-Za-z0-9_]+)"\\];$`,
      "u",
    ).exec(line);
    if (opened !== null) path = opened[1];
    else if (method !== null) {
      const [, verb, id] = method;
      if (path === undefined || verb === undefined || id === undefined)
        throw new Error(`a method outside a path: ${line}`);
      if (routes.has(id)) throw new Error(`operation ${id} is served twice`);
      routes.set(
        id,
        `  ${id}: { path: ${JSON.stringify(path)}; method: "${verb}" };`,
      );
    } else if (
      /^ {4}[a-z]+[?]?:/u.test(line) &&
      !/^ {4}parameters:/u.test(line)
    )
      throw new Error(`cannot read the route of: ${line.trim()}`);
  }
  if (routes.size === 0) throw new Error("the document has no operations");
  return [
    "/** Each operation's path and method, by `operationId`, read from `paths`. */",
    "export type operationRoutes = {",
    ...routes.values(),
    "};",
    "",
  ].join("\n");
};
