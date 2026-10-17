// How the game learns its parent's origin: the `parentOrigin` parameter, the
// browser's `ancestorOrigins`, both when they agree, and nobody otherwise.

import { describe, expect, it } from "vitest";

import { isSerializedOrigin, parentOriginOf } from "./parent-origin.ts";

const WRAPPER = "https://wrapper.example.test";
const query = (value: string): string =>
  `?parentOrigin=${encodeURIComponent(value)}`;

describe("isSerializedOrigin", () => {
  it.each([
    WRAPPER,
    "https://wrapper.example.test:8443",
    "http://localhost:5173",
    "http://127.0.0.1:4000",
  ])("accepts %s", origin => {
    expect(isSerializedOrigin(origin)).toBe(true);
  });

  it.each([
    "null",
    "*",
    "",
    "wrapper.example.test",
    "http://wrapper.example.test",
    "https://wrapper.example.test/",
    "https://wrapper.example.test/play",
    "https://user@wrapper.example.test",
    "https://WRAPPER.example.test",
    "https://wrapper.example.test:443",
    "javascript:alert(1)",
  ])("refuses %s", value => {
    expect(isSerializedOrigin(value)).toBe(false);
  });
});

describe("parentOriginOf", () => {
  it("takes the parameter when the browser reports nothing", () => {
    expect(parentOriginOf(query(WRAPPER))).toBe(WRAPPER);
    expect(parentOriginOf(query(WRAPPER), [])).toBe(WRAPPER);
  });

  it("takes the browser's report when there is no parameter", () => {
    expect(parentOriginOf("", [WRAPPER, "https://casino.example.test"])).toBe(
      WRAPPER,
    );
  });

  it("takes the two when they agree", () => {
    expect(parentOriginOf(query(WRAPPER), [WRAPPER])).toBe(WRAPPER);
  });

  it("talks to nobody when they disagree", () => {
    expect(
      parentOriginOf(query("https://evil.example.test"), [WRAPPER]),
    ).toBeUndefined();
  });

  it("talks to nobody when there is neither", () => {
    expect(parentOriginOf("")).toBeUndefined();
    expect(parentOriginOf("?other=1", [])).toBeUndefined();
  });

  it("talks to nobody when the parameter is not an origin or is repeated", () => {
    expect(parentOriginOf(query("*"))).toBeUndefined();
    expect(parentOriginOf(query(`${WRAPPER}/`))).toBeUndefined();
    expect(
      parentOriginOf(
        `${query(WRAPPER)}&parentOrigin=${encodeURIComponent(WRAPPER)}`,
      ),
    ).toBeUndefined();
  });

  it('treats a masked report ("null") as no report', () => {
    expect(parentOriginOf("", ["null"])).toBeUndefined();
    expect(parentOriginOf(query(WRAPPER), ["null"])).toBe(WRAPPER);
  });

  it.each(["", "*", "https://wrapper.example.test/", "NULL", "null "])(
    "talks to nobody when the report is %j, which is neither an origin nor masked",
    report => {
      expect(parentOriginOf("", [report])).toBeUndefined();
      expect(parentOriginOf(query(WRAPPER), [report])).toBeUndefined();
    },
  );
});
