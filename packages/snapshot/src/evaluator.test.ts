import { snapshotSchema } from "@intraverse/se-client-contracts";
import { describe, expect, it } from "vitest";

import {
  createEvaluator,
  SUPPORTED_KEYWORDS,
  type ValidationIssue,
} from "./evaluator/index.ts";

const issuesOf = (
  schema: unknown,
  instance: unknown,
): readonly ValidationIssue[] => createEvaluator(schema)("#", instance);

const keywordsOf = (schema: unknown, instance: unknown): string[] =>
  issuesOf(schema, instance).map(issue => issue.keyword);

describe("the keyword profile", () => {
  it.each([
    [{ type: "string" }, "a", "type", 1],
    [{ type: "integer" }, 2, "type", 2.5],
    [{ type: "number" }, 2.5, "type", "2.5"],
    [{ type: "object" }, {}, "type", []],
    [{ type: "array" }, [], "type", {}],
    [{ type: "boolean" }, false, "type", 0],
    [{ type: "null" }, null, "type", 0],
    [{ type: ["string", "null"] }, null, "type", 1],
    [{ const: "se.snapshot/1" }, "se.snapshot/1", "const", "se.snapshot/2"],
    [{ const: { a: [1] } }, { a: [1] }, "const", { a: [1], b: 2 }],
    [{ enum: ["a", "b"] }, "b", "enum", "c"],
    [{ minimum: 0 }, 0, "minimum", -1],
    [{ maximum: 77 }, 77, "maximum", 78],
    [{ minLength: 1 }, "a", "minLength", ""],
    [{ maxLength: 2 }, "ab", "maxLength", "abc"],
    [{ pattern: "^a$" }, "a", "pattern", "a\n"],
    [{ required: ["a"] }, { a: 1 }, "required", { b: 1 }],
    [
      { additionalProperties: false, properties: { a: {} } },
      { a: 1 },
      "additionalProperties",
      { a: 1, b: 2 },
    ],
    [
      { dependentRequired: { a: ["b"] } },
      { a: 1, b: 2 },
      "dependentRequired",
      { a: 1 },
    ],
    [{ minItems: 1 }, [1], "minItems", []],
    [{ maxItems: 1 }, [1], "maxItems", [1, 2]],
    [{ items: { type: "string" } }, ["a"], "type", ["a", 1]],
    [{ not: { required: ["a"] } }, {}, "not", { a: 1 }],
    [{ anyOf: [{ type: "string" }, { type: "null" }] }, null, "anyOf", 1],
    [{ oneOf: [{ type: "string" }, { maxLength: 1 }] }, "ab", "oneOf", "a"],
  ])("%j accepts %j and fails %s on %j", (schema, good, keyword, bad) => {
    expect(issuesOf(schema, good)).toEqual([]);
    expect(keywordsOf(schema, bad)).toEqual([keyword]);
  });

  it("applies a type-specific keyword only to its type", () => {
    const schema = {
      minimum: 0,
      maxLength: 1,
      pattern: "^a$",
      required: ["a"],
      minItems: 1,
      properties: { a: false },
      items: false,
    };
    expect(keywordsOf(schema, null)).toEqual([]);
    expect(keywordsOf(schema, true)).toEqual([]);
    expect(keywordsOf(schema, -1)).toEqual(["minimum"]);
    expect(keywordsOf(schema, "bb")).toEqual(["maxLength", "pattern"]);
    expect(keywordsOf(schema, {})).toEqual(["required"]);
    expect(keywordsOf(schema, [])).toEqual(["minItems"]);
  });

  it("counts a string's length in code points", () => {
    expect(issuesOf({ maxLength: 1 }, "😀")).toEqual([]);
    expect(keywordsOf({ minLength: 2 }, "😀")).toEqual(["minLength"]);
  });

  it("matches a pattern against the whole string, with no trailing newline", () => {
    const schema = { pattern: "^[0-9a-f]{2}$" };
    expect(issuesOf(schema, "0a")).toEqual([]);
    expect(keywordsOf(schema, "0a\n")).toEqual(["pattern"]);
    expect(keywordsOf(schema, "\n0a")).toEqual(["pattern"]);
  });

  it("counts an own __proto__ key as an additional property", () => {
    const instance: unknown = JSON.parse('{"__proto__": {}}');
    expect(keywordsOf({ additionalProperties: false }, instance)).toEqual([
      "additionalProperties",
    ]);
    expect(keywordsOf({ required: ["__proto__"] }, {})).toEqual(["required"]);
  });

  it("applies a schema-valued additionalProperties to each extra member, reporting at the object", () => {
    const schema = {
      properties: { a: {} },
      additionalProperties: { type: "string" },
    };
    expect(issuesOf(schema, { a: 1, b: "x" })).toEqual([]);
    expect(issuesOf(schema, { a: 1, b: 2 })).toEqual([
      {
        instancePath: "",
        schemaPath: "/additionalProperties/type",
        keyword: "type",
      },
    ]);
  });

  it("applies then or else by the if, and reports their failures as theirs", () => {
    // Parsed from text: an object literal with a `then` member is a thenable.
    const schema: unknown = JSON.parse(
      '{"if": {"properties": {"s": {"const": "a"}}}, "then": {"required": ["x"]}, "else": {"properties": {"y": {"type": "string"}}}}',
    );
    expect(issuesOf(schema, { s: "a" })).toEqual([
      { instancePath: "", schemaPath: "/then/required", keyword: "required" },
    ]);
    expect(issuesOf(schema, { s: "b", y: 1 })).toEqual([
      {
        instancePath: "/y",
        schemaPath: "/else/properties/y/type",
        keyword: "type",
      },
    ]);
    expect(issuesOf(JSON.parse('{"then": false}'), 1)).toEqual([]);
  });

  it("reports anyOf, oneOf, and not at their own location", () => {
    const schema = {
      properties: { c: { oneOf: [{ required: ["a"] }, { required: ["b"] }] } },
    };
    expect(issuesOf(schema, { c: {} })).toEqual([
      {
        instancePath: "/c",
        schemaPath: "/properties/c/oneOf",
        keyword: "oneOf",
      },
    ]);
    expect(keywordsOf(schema, { c: { a: 1, b: 2 } })).toEqual(["oneOf"]);
  });

  it("resolves $ref to the root and into $defs", () => {
    const schema = {
      properties: { self: { $ref: "#" }, n: { $ref: "#/$defs/N" } },
      $defs: { N: { type: "integer" } },
    };
    expect(issuesOf(schema, { self: { n: 1 } })).toEqual([]);
    expect(issuesOf(schema, { self: { n: "1" } })).toEqual([
      { instancePath: "/self/n", schemaPath: "/$defs/N/type", keyword: "type" },
    ]);
  });

  it("escapes pointer tokens", () => {
    expect(
      issuesOf({ properties: { "a/b~c": false } }, { "a/b~c": 1 }),
    ).toEqual([
      {
        instancePath: "/a~1b~0c",
        schemaPath: "/properties/a~1b~0c",
        keyword: "false",
      },
    ]);
  });

  it("collects every failure, in schema order", () => {
    const schema = {
      required: ["a"],
      properties: { b: { type: "string" } },
      maxProperties: 1,
    };
    expect(keywordsOf(schema, { b: 1 })).toEqual([
      "required",
      "type",
      "unsupported",
    ]);
  });

  it("never puts a document value in an issue", () => {
    const marker = "MARKER-VALUE-0123456789";
    const schema = {
      additionalProperties: false,
      properties: { a: { pattern: "^x$" }, b: { enum: ["x"] } },
    };
    const issues = issuesOf(schema, { a: marker, b: marker, [marker]: marker });
    expect(issues.length).toBe(3);
    expect(JSON.stringify(issues)).not.toContain(marker);
    const open = {
      properties: { a: {} },
      additionalProperties: { type: "string" },
    };
    const extra = issuesOf(open, { a: marker, [marker]: 1 });
    expect(extra.length).toBe(1);
    expect(JSON.stringify(extra)).not.toContain(marker);
  });
});

describe("fail closed", () => {
  it.each([
    ["an unknown keyword", { maxProperties: 1 }],
    ["an unknown type name", { type: "int" }],
    ["an empty type list", { type: [] }],
    ["an invalid pattern", { pattern: "(" }],
    ["a non-string pattern", { pattern: 1 }],
    ["a non-numeric bound", { minimum: "0" }],
    ["a negative length", { maxLength: -1 }],
    ["a non-array required", { required: "a" }],
    ["a non-array enum", { enum: "a" }],
    ["a malformed dependentRequired", { dependentRequired: { a: "b" } }],
    ["a tuple items", { items: [{}] }],
    ["an empty allOf", { allOf: [] }],
    ["a remote $ref", { $ref: "https://example.com/schema" }],
    ["a dangling $ref", { $ref: "#/$defs/Missing" }],
    ["a malformed $ref escape", { $ref: "#/%E0%A4%A" }],
  ])("rejects every instance under %s", (_name, schema) => {
    for (const instance of [{ a: "x" }, "x", 1, null]) {
      expect(keywordsOf(schema, instance)).toContain("unsupported");
    }
  });

  it("rejects a subschema that is not an object or boolean where it applies", () => {
    expect(keywordsOf({ properties: { a: 1 } }, { a: "x" })).toEqual([
      "unsupported",
    ]);
  });

  it("fails a ref that names no subschema", () => {
    expect(createEvaluator({})("#/$defs/Missing", {})).toEqual([
      { instancePath: "", schemaPath: "", keyword: "unsupported" },
    ]);
  });

  it("turns an exception into one evaluation issue instead of throwing", () => {
    const loop = { $defs: { A: { $ref: "#/$defs/A" } }, $ref: "#/$defs/A" };
    expect(issuesOf(loop, 1)).toEqual([
      { instancePath: "", schemaPath: "", keyword: "evaluation" },
    ]);
  });
});

/** Every keyword of every subschema in a schema document. */
const keywordsIn = (schema: unknown): string[] => {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return [];
  }
  const found: string[] = [];
  for (const [keyword, value] of Object.entries(schema)) {
    found.push(keyword);
    if (
      ["properties", "$defs"].includes(keyword) &&
      typeof value === "object" &&
      value !== null
    ) {
      found.push(...Object.values(value).flatMap(entry => keywordsIn(entry)));
    } else if (
      ["allOf", "anyOf", "oneOf"].includes(keyword) &&
      Array.isArray(value)
    ) {
      found.push(...value.flatMap(entry => keywordsIn(entry)));
    } else if (
      ["not", "if", "then", "else", "items", "additionalProperties"].includes(
        keyword,
      )
    ) {
      found.push(...keywordsIn(value));
    }
  }
  return found;
};

describe("the vendored schema", () => {
  it("uses only keywords of the profile", () => {
    const used = new Set(keywordsIn(snapshotSchema));
    expect(
      [...used].filter(keyword => !SUPPORTED_KEYWORDS.has(keyword)),
    ).toEqual([]);
    expect(used.has("pattern")).toBe(true);
  });

  it("is a draft 2020-12 schema", () => {
    expect(snapshotSchema["$schema"]).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });
});
