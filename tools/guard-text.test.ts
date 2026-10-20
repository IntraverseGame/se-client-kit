import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeEntities, decodePercent, NAMED_ENTITIES } from "./guard-text.ts";

// The decoders behind the guard's check of CSS and HTML text.

const standard = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "html-path-entities.json"),
    "utf8",
  ),
) as { referenceCount: number; references: Record<string, string> };

describe("named HTML references that can spell a path", () => {
  it("covers every reference of the standard that expands to path characters", () => {
    expect(standard.referenceCount).toBe(2231);
    for (const [reference, expansion] of Object.entries(standard.references)) {
      expect(decodeEntities(reference)).toBe(expansion);
    }
  });

  it("has no name the standard's selection lacks", () => {
    const names = new Set(
      Object.keys(standard.references).map(reference =>
        reference.replace(/^&/u, "").replace(/;$/u, ""),
      ),
    );
    expect(Object.keys(NAMED_ENTITIES).toSorted()).toEqual(
      [...names].toSorted(),
    );
  });

  it("covers the characters that matter", () => {
    const decoded = new Set(Object.values(standard.references));
    for (const character of ["/", "\\", ".", "%", ":", "?", "#", "&"]) {
      expect(decoded.has(character)).toBe(true);
    }
  });
});

describe("numeric references and percent sequences", () => {
  it.each([
    ["&#116;", "t"],
    ["&#x74;", "t"],
    ["&#116", "t"],
    ["&#x74", "t"],
    ["&#00000000037;", "%"],
    ["&#x00000025;", "%"],
    ["&#x0000076;", "v"],
    ["&#0;", "\0"],
  ])("decodes %s", (reference, expected) => {
    expect(decodeEntities(reference)).toBe(expected);
  });

  it.each(["&#99999999;", "&#x110000;", "&unknown;", "&sol", "&notanentity"])(
    "leaves %s as written",
    reference => {
      expect(decodeEntities(reference)).toBe(reference);
    },
  );

  it("decodes a legacy name without a semicolon only for amp", () => {
    expect(decodeEntities("&amp x")).toBe("& x");
    expect(decodeEntities("&AMP x")).toBe("& x");
  });

  it("decodes valid percent sequences and leaves a stray percent", () => {
    expect(decodePercent("100% %76ectors %zz")).toBe("100% vectors %zz");
  });
});
