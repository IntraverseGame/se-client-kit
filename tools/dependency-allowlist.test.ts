import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import allowlist from "./allowed-dependencies.json" with { type: "json" };
import { findViolations, type Manifest } from "./dependency-allowlist.ts";

const repoRoot = join(import.meta.dirname, "..");

const root = (json: object): Manifest => ({ directory: "", json });
const pkg = (directory: string, json: object): Manifest => ({
  directory,
  json,
});

/** The package names in the first column of ADR-001's dependency table. */
function adrTablePackages(): string[] {
  const adr = readFileSync(
    join(repoRoot, "decisions", "ADR-001-toolchain-and-signing.md"),
    "utf8",
  );
  const table = adr.slice(
    adr.indexOf("### Dependency table"),
    adr.indexOf("## References"),
  );
  const names = new Set<string>();
  for (const row of table.split("\n")) {
    const firstColumn = row.startsWith("| `") ? (row.split("|")[1] ?? "") : "";
    for (const match of firstColumn.matchAll(/`([^`]+)`/gu)) {
      names.add(match[1] ?? "");
    }
  }
  return [...names];
}

describe("dependency allow-list", () => {
  it("accepts the allowed runtime dependencies in signing", () => {
    const manifests = [
      pkg("packages/signing", {
        name: "@superengine/signing",
        dependencies: { "@noble/curves": "1.0.0", "@noble/hashes": "1.0.0" },
      }),
    ];
    expect(findViolations(manifests, allowlist)).toEqual([]);
  });

  it("accepts allowed development dependencies and workspace dependencies", () => {
    const manifests = [
      root({
        name: "root",
        devDependencies: { typescript: "7.0.2", wireit: "0.14.13" },
      }),
      pkg("packages/snapshot", { name: "@superengine/snapshot" }),
      pkg("packages/shell", {
        name: "@superengine/shell",
        dependencies: { "@superengine/snapshot": "workspace:*" },
      }),
    ];
    expect(findViolations(manifests, allowlist)).toEqual([]);
  });

  it("fails on a runtime dependency that is not on the list", () => {
    const manifests = [
      pkg("packages/shell", { name: "s", dependencies: { ajv: "1.0.0" } }),
    ];
    expect(findViolations(manifests, allowlist)).toEqual([
      "packages/shell/package.json: dependencies.ajv is not an allowed runtime dependency (ADR-001, decision 8)",
    ]);
  });

  it("fails on an allowed runtime dependency outside signing", () => {
    const manifests = [
      pkg("packages/shell", {
        name: "s",
        dependencies: { "@noble/curves": "1.0.0" },
      }),
    ];
    expect(findViolations(manifests, allowlist)).toHaveLength(1);
  });

  it("fails on a development dependency that is not on the list", () => {
    const manifests = [
      root({ name: "root", devDependencies: { viem: "2.0.0" } }),
    ];
    expect(findViolations(manifests, allowlist)).toEqual([
      "package.json: devDependencies.viem is not on the ADR-001 allow-list",
    ]);
  });

  it("fails on a runtime dependency declared as a peer or optional dependency", () => {
    const manifests = [
      pkg("packages/shell", {
        name: "s",
        peerDependencies: { react: "19.0.0" },
        optionalDependencies: { fsevents: "2.0.0" },
      }),
    ];
    expect(findViolations(manifests, allowlist)).toHaveLength(2);
  });

  it("fails on a kit package that does not use the workspace protocol", () => {
    const manifests = [
      pkg("packages/snapshot", { name: "@superengine/snapshot" }),
      pkg("packages/shell", {
        name: "@superengine/shell",
        dependencies: { "@superengine/snapshot": "^1.0.0" },
      }),
    ];
    expect(findViolations(manifests, allowlist)).toHaveLength(1);
  });

  it("fails on bundled dependencies", () => {
    const manifests = [
      pkg("packages/shell", { name: "s", bundledDependencies: ["x"] }),
    ];
    expect(findViolations(manifests, allowlist)).toHaveLength(1);
  });

  it("lists the same packages as the dependency table of ADR-001", () => {
    const inJson = new Set([
      ...Object.keys(allowlist.runtime),
      ...allowlist.development,
    ]);
    expect(adrTablePackages().toSorted()).toEqual([...inJson].toSorted());
  });
});
