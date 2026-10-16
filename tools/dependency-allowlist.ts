// The npm dependency allow-list of ADR-001 (decision 8 and the dependency
// table). Runtime dependencies are `@noble/curves` and `@noble/hashes`, in
// `signing` only; everything else is a development dependency from the table.
// A kit package may depend on another through the workspace protocol; every
// other specifier must be an exact registry version (see
// dependency-specifiers.ts). Overrides and catalogs, in package.json and in
// pnpm-workspace.yaml, are held to the same names and specifiers.

import {
  checkCatalog,
  checkCatalogs,
  checkOverrides,
  externalSpecifierProblem,
  type SpecifierContext,
} from "./dependency-specifiers.ts";
import { readWorkspaceSections } from "./workspace-yaml.ts";

export type Allowlist = {
  /** Runtime dependency name -> the package directories allowed to use it. */
  readonly runtime: Readonly<Record<string, readonly string[]>>;
  readonly development: readonly string[];
};

export type Manifest = {
  /**
   * Directory of the package.json relative to the repository root ("" for the
   * root).
   */
  readonly directory: string;
  readonly json: unknown;
};

const RUNTIME_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const DEVELOPMENT_FIELDS = ["devDependencies"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const label = (manifest: Manifest): string => {
  return manifest.directory === ""
    ? "package.json"
    : `${manifest.directory}/package.json`;
};

const nameOf = (manifest: Manifest): string | undefined => {
  return isRecord(manifest.json) && typeof manifest.json["name"] === "string"
    ? manifest.json["name"]
    : undefined;
};

type Context = SpecifierContext & {
  readonly allowlist: Allowlist;
};

const checkSection = (
  manifest: Manifest,
  field: string,
  runtime: boolean,
  section: Record<string, unknown>,
  context: Context,
): string[] => {
  const problems: string[] = [];
  for (const [name, specifier] of Object.entries(section)) {
    const where = `${label(manifest)}: ${field}.${name}`;
    if (context.workspaceNames.has(name)) {
      if (
        typeof specifier !== "string" ||
        !specifier.startsWith("workspace:")
      ) {
        problems.push(
          `${where} is a kit package and must use the workspace: protocol`,
        );
      }
      continue;
    }
    if (runtime) {
      const allowedIn = context.allowlist.runtime[name];
      if (allowedIn === undefined) {
        problems.push(
          `${where} is not an allowed runtime dependency (ADR-001, decision 8)`,
        );
      } else if (!allowedIn.includes(manifest.directory)) {
        problems.push(`${where} is allowed in ${allowedIn.join(", ")} only`);
      }
    } else if (!context.allowlist.development.includes(name)) {
      problems.push(`${where} is not on the ADR-001 allow-list`);
    }
    const problem = externalSpecifierProblem(specifier);
    if (problem !== undefined) problems.push(`${where} ${problem}`);
  }
  return problems;
};

/** `overrides`, `pnpm.overrides`, `resolutions`, `catalog`, and `catalogs`. */
const checkPinning = (
  manifest: Manifest,
  json: Record<string, unknown>,
  context: Context,
): string[] => {
  const pnpm = isRecord(json["pnpm"]) ? json["pnpm"] : {};
  const where = label(manifest);
  const sources: [string, unknown, "overrides" | "catalog" | "catalogs"][] = [
    ["overrides", json["overrides"], "overrides"],
    ["pnpm.overrides", pnpm["overrides"], "overrides"],
    ["resolutions", json["resolutions"], "overrides"],
    ["catalog", json["catalog"], "catalog"],
    ["pnpm.catalog", pnpm["catalog"], "catalog"],
    ["catalogs", json["catalogs"], "catalogs"],
    ["pnpm.catalogs", pnpm["catalogs"], "catalogs"],
  ];
  const checks = {
    overrides: checkOverrides,
    catalog: checkCatalog,
    catalogs: checkCatalogs,
  };
  return sources.flatMap(([field, value, kind]) =>
    value === undefined
      ? []
      : checks[kind](`${where}: ${field}`, value, context),
  );
};

const checkManifest = (manifest: Manifest, context: Context): string[] => {
  if (!isRecord(manifest.json))
    return [`${label(manifest)}: not a JSON object`];
  const json = manifest.json;
  const problems: string[] = [];
  if (
    json["bundledDependencies"] !== undefined ||
    json["bundleDependencies"] !== undefined
  ) {
    problems.push(`${label(manifest)}: bundled dependencies are not allowed`);
  }
  const fields = [
    ...RUNTIME_FIELDS.map(field => ({ field, runtime: true })),
    ...DEVELOPMENT_FIELDS.map(field => ({ field, runtime: false })),
  ];
  for (const { field, runtime } of fields) {
    const section = json[field];
    if (section === undefined) continue;
    if (isRecord(section)) {
      problems.push(
        ...checkSection(manifest, field, runtime, section, context),
      );
    } else {
      problems.push(`${label(manifest)}: "${field}" is not an object`);
    }
  }
  problems.push(...checkPinning(manifest, json, context));
  return problems;
};

const contextFor = (
  manifests: readonly Manifest[],
  allowlist: Allowlist,
): Context => {
  const workspaceNames = new Set(
    manifests
      .map(manifest => nameOf(manifest))
      .filter((name): name is string => name !== undefined),
  );
  const allowedNames = new Set([
    ...Object.keys(allowlist.runtime),
    ...allowlist.development,
  ]);
  return { allowlist, allowedNames, workspaceNames };
};

/** The problems found; an empty array means every dependency is allowed. */
export const findViolations = (
  manifests: readonly Manifest[],
  allowlist: Allowlist,
  workspaceYaml?: string,
): string[] => {
  const context = contextFor(manifests, allowlist);
  const problems = manifests.flatMap(manifest =>
    checkManifest(manifest, context),
  );
  if (workspaceYaml !== undefined) {
    problems.push(...checkWorkspaceYaml(workspaceYaml, context));
  }
  return problems;
};

/** `overrides`, `catalog`, and `catalogs` of pnpm-workspace.yaml. */
const checkWorkspaceYaml = (text: string, context: Context): string[] => {
  const { sections, problems } = readWorkspaceSections(text);
  const where = "pnpm-workspace.yaml";
  const overrides = sections["overrides"];
  const catalog = sections["catalog"];
  const catalogs = sections["catalogs"];
  return [
    ...problems,
    ...(overrides === undefined
      ? []
      : checkOverrides(`${where}: overrides`, overrides, context)),
    ...(catalog === undefined
      ? []
      : checkCatalog(`${where}: catalog`, catalog, context)),
    ...(catalogs === undefined
      ? []
      : checkCatalogs(`${where}: catalogs`, catalogs, context)),
  ];
};
