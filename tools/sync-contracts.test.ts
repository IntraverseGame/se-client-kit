import { describe, expect, it } from "vitest";

import { GROUPS } from "./contracts-groups.ts";
import { SOURCES } from "./fixtures/contracts-memory-source.ts";
import { parseSources } from "./sync-contracts.ts";

const complete = (): Record<string, unknown> => ({ ...SOURCES });

describe("the sources file", () => {
  it("accepts a file that names every group", () => {
    expect(Object.keys(parseSources(JSON.stringify(complete())))).toEqual(
      GROUPS.map(group => group.id),
    );
  });

  it("resolves the repository to an absolute path", () => {
    const parsed = parseSources(JSON.stringify(complete()));
    expect(parsed["signing-vectors"]?.repo).toMatch(/^\//u);
  });

  it("rejects a file that is not an object", () => {
    expect(() => parseSources("[]")).toThrow(/must be an object/u);
  });

  it("rejects a file that lacks a group", () => {
    const { "signing-vectors": _omitted, ...rest } = complete();
    expect(() => parseSources(JSON.stringify(rest))).toThrow(
      /no source for "signing-vectors"/u,
    );
  });

  it("rejects a group with an empty field", () => {
    const text = JSON.stringify({
      ...complete(),
      "signing-vectors": { ...SOURCES["signing-vectors"], ref: "" },
    });
    expect(() => parseSources(text)).toThrow(
      /needs a name, repo, ref and path/u,
    );
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseSources("{")).toThrow(/JSON/u);
  });
});
