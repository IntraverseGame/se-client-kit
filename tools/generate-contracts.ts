// Generated files of packages/contracts. Committed, never edited by hand, and
// proved current by `check:contracts`
// (specs/client-kit/the-contracts-package.md):
//
//   src/generated/snapshot.ts   the structural types of the Snapshot schema
//   src/generated/play.ts       the types of the Play API document (/play/v1)
//   src/generated/verify.ts     ... and of the verify API document (/verify/v1)
//   src/vectors/catalog.ts      every vendored vector, for the test-only entry
//
//   pnpm exec tsx tools/generate-contracts.ts          # fail if out of date
//   pnpm exec tsx tools/generate-contracts.ts --write  # regenerate

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { BANNER, catalogSource } from "./contracts-catalog.ts";
import { operationRoutes } from "./play-routes.ts";

// json-schema-to-typescript is loaded through a computed specifier on purpose.
// Its declarations import a .d.ts that does not compile under this
// repository's strict options (`exactOptionalPropertyTypes` with `skipLibCheck`
// off, which stay as they are), and TypeScript loads declarations only for a
// literal specifier. The one function used is described here instead, and its
// presence is checked at run time.
const GENERATOR = "json-schema-to-typescript";

type Compile = (
  schema: object,
  name: string,
  options: {
    readonly bannerComment: string;
    readonly format: boolean;
    readonly additionalProperties: boolean;
    readonly strictIndexSignatures: boolean;
    readonly unreachableDefinitions: boolean;
  },
) => Promise<string>;

const loadCompile = async (): Promise<Compile> => {
  const library: unknown = await import(GENERATOR);
  if (
    typeof library === "object" &&
    library !== null &&
    "compile" in library &&
    typeof library.compile === "function"
  )
    return library.compile as Compile;
  throw new Error(`${GENERATOR} has no compile function`);
};

// openapi-typescript (6.x, ADR-004) is loaded the same way: the tools'
// typecheck stays independent of its declarations, which type options this
// script never uses. Its one function is described here and checked at run
// time. It reads the document from a `file:` URL; `fetch` is replaced by one
// that refuses, so a reference that is not local fails the generation instead
// of reaching the network.
const OPENAPI_GENERATOR = "openapi-typescript";

type OpenApiTs = (
  source: URL,
  options: {
    readonly exportType: boolean;
    readonly emptyObjectsUnknown: boolean;
    readonly additionalProperties: boolean;
    readonly silent: boolean;
    readonly commentHeader: string;
    readonly fetch: () => never;
  },
) => Promise<string>;

const loadOpenApi = async (): Promise<OpenApiTs> => {
  const library: unknown = await import(OPENAPI_GENERATOR);
  if (
    typeof library === "object" &&
    library !== null &&
    "default" in library &&
    typeof library.default === "function"
  )
    return library.default as OpenApiTs;
  throw new Error(`${OPENAPI_GENERATOR} has no default export`);
};

const noNetwork = (): never => {
  throw new Error("an API document refers outside itself");
};

const SCHEMA = "src/schemas/se.snapshot.v1.schema.json";
const SNAPSHOT_TYPES = "src/generated/snapshot.ts";
const PLAY_DOCUMENT = "src/schemas/play.v1.openapi.yaml";
const PLAY_TYPES = "src/generated/play.ts";
const VERIFY_DOCUMENT = "src/schemas/verify.v1.openapi.yaml";
const VERIFY_TYPES = "src/generated/verify.ts";
const CATALOG = "src/vectors/catalog.ts";

/**
 * Rewrites each `export interface` the generator emits as an `export type`
 * alias, since the kit prefers `type` (AGENTS.md) and the generator has no
 * option for it. The body of an interface is already a valid object type. An
 * interface that extends another has no one-line rewrite, so it fails the
 * generation instead of passing through.
 */
export const toTypeAliases = (source: string): string => {
  const rewritten = source.replaceAll(
    /^export interface ([A-Za-z0-9_$]+) \{$/gmu,
    "export type $1 = {",
  );
  const left = /^export interface .*$/mu.exec(rewritten);
  if (left !== null)
    throw new Error(`cannot rewrite as a type alias: ${left[0]}`);
  return rewritten;
};

/**
 * Drops the generator's "This interface was referenced by ... via the
 * `definition` ..." notes from the doc comments (each is emitted twice, names
 * `undefined` for the schema, and says "interface" for a type alias), with the
 * blank comment line before a note and any doc comment left empty. A note in
 * any other shape fails the generation instead of passing through.
 */
export const withoutReferenceNotes = (source: string): string => {
  const stripped = source
    .replaceAll(
      /^(?: \* \n)? \* This interface was referenced by .*'s JSON-Schema\n \* via the `definition` "[^"\n]*"\.\n/gmu,
      "",
    )
    .replaceAll(/^\/\*\*\n \*\/\n/gmu, "");
  const left = /^.*was referenced by.*$/mu.exec(stripped);
  if (left !== null)
    throw new Error(`cannot drop the reference note: ${left[0]}`);
  return stripped;
};

const snapshotTypes = async (packageDir: string): Promise<string> => {
  const schema: unknown = JSON.parse(
    readFileSync(join(packageDir, SCHEMA), "utf8"),
  );
  if (typeof schema !== "object" || schema === null)
    throw new Error(`${SCHEMA} is not an object`);
  const compile = await loadCompile();
  const body = await compile(schema, "Snapshot", {
    bannerComment: "",
    format: false,
    additionalProperties: false,
    strictIndexSignatures: true,
    unreachableDefinitions: true,
  });
  return `${BANNER(SCHEMA)}${withoutReferenceNotes(toTypeAliases(body))}`;
};

/**
 * The types of an OpenAPI document (the Play API's or the verify API's). Every
 * object is a `type` alias (`exportType`); an object schema without properties
 * is a record of `unknown` values, not of `never`; an object the document does
 * not close stays closed.
 */
const apiTypes = async (dir: string, document: string): Promise<string> => {
  const openapiTs = await loadOpenApi();
  const body = await openapiTs(pathToFileURL(join(dir, document)), {
    exportType: true,
    emptyObjectsUnknown: true,
    additionalProperties: false,
    silent: true,
    commentHeader: "",
    fetch: noNetwork,
  });
  const types = toTypeAliases(body);
  return `${BANNER(document)}${types}\n${operationRoutes(types)}`;
};

/** Package-relative path -> content, for every generated file. */
export const generateContractsFiles = async (
  packageDir: string,
): Promise<Map<string, string>> =>
  new Map([
    [SNAPSHOT_TYPES, await snapshotTypes(packageDir)],
    [PLAY_TYPES, await apiTypes(packageDir, PLAY_DOCUMENT)],
    [VERIFY_TYPES, await apiTypes(packageDir, VERIFY_DOCUMENT)],
    [CATALOG, catalogSource(packageDir)],
  ]);

/** Paths whose committed content differs from a regeneration. */
export const staleGeneratedFiles = async (
  packageDir: string,
): Promise<string[]> => {
  const stale: string[] = [];
  for (const [path, expected] of await generateContractsFiles(packageDir)) {
    let actual: string | undefined;
    try {
      actual = readFileSync(join(packageDir, path), "utf8");
    } catch {
      actual = undefined;
    }
    if (actual !== expected) stale.push(path);
  }
  return stale.toSorted();
};

if (import.meta.main) {
  const packageDir = join(import.meta.dirname, "..", "packages", "contracts");
  if (process.argv.includes("--write")) {
    for (const [path, content] of await generateContractsFiles(packageDir)) {
      mkdirSync(dirname(join(packageDir, path)), { recursive: true });
      writeFileSync(join(packageDir, path), content);
      console.log(`contracts: wrote ${path}`);
    }
  } else {
    const stale = await staleGeneratedFiles(packageDir);
    if (stale.length > 0) {
      console.error("These generated files are out of date; regenerate them:");
      for (const path of stale) console.error(`  packages/contracts/${path}`);
      process.exitCode = 1;
    } else {
      console.log("contracts: generated files are current");
    }
  }
}
