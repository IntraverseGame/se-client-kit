// `isGamePath` accepts and refuses exactly what the vendored Play API document
// does for `RedeemResponse.gamePath` (packages/contracts, play.v1.openapi.yaml):
// its `pattern`, `minLength` 1, and `maxLength` 255. Each case is checked
// against both, so the two cannot drift apart unnoticed.

import { describe, expect, it } from "vitest";

import { isGamePath } from "./redeem-fields.ts";

/** The document's `pattern` of `RedeemResponse.gamePath`, as vendored. */
const CONTRACT_PATTERN =
  /^\/(([A-Za-z0-9_~-]|[A-Za-z0-9_~-][A-Za-z0-9._~-]|\.[A-Za-z0-9_~-]|[A-Za-z0-9._~-]{3,63})\/)*$/u;

/** The document's rule: `minLength`, `maxLength` (code points), `pattern`. */
const contractAccepts = (value: string): boolean =>
  [...value].length > 0 &&
  [...value].length <= 255 &&
  CONTRACT_PATTERN.test(value);

describe("isGamePath", () => {
  it.each([
    ["the root", "/", true],
    ["one segment", "/a/", true],
    ["two segments", "/a/b/", true],
    ["a typical path", "/coin-flip/", true],
    ["every allowed character", "/A-Z_a.z~0/", true],
    ["a segment starting with .", "/.a/", true],
    ["a segment ending with .", "/a./", true],
    ["a segment of three dots", "/.../", true],
    ["a segment of 63 characters", `/${"a".repeat(63)}/`, true],
    ["255 characters", `/${"a/".repeat(127)}`, true],
    ["an empty string", "", false],
    ["no leading /", "a/", false],
    ["no trailing /", "/a", false],
    ["neither slash", "a", false],
    ["a . segment", "/./", false],
    ["a .. segment", "/../", false],
    ["a .. segment after another", "/a/../", false],
    ["//", "//", false],
    ["// inside", "/a//b/", false],
    ["a host-like //", "//evil.example/", false],
    ["?", "/a?b/", false],
    ["#", "/a#b/", false],
    ["%", "/a%2F/", false],
    ["a backslash", "/a\\b/", false],
    ["a non-ASCII letter", "/café/", false],
    ["an emoji", "/\u{1F3B2}/", false],
    ["a space", "/a b/", false],
    ["a trailing newline", "/a/\n", false],
    ["a segment of 64 characters", `/${"a".repeat(64)}/`, false],
    ["257 characters", `/${"a/".repeat(128)}`, false],
  ])("for %s answers %s as the document does", (_name, value, accepted) => {
    expect(contractAccepts(value)).toBe(accepted);
    expect(isGamePath(value)).toBe(accepted);
  });

  it.each([
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["an array", ["/"]],
  ])("refuses %s", (_name, value) => {
    expect(isGamePath(value)).toBe(false);
  });
});
