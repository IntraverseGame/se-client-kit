// The secret scan's forms and redaction, in Node only (no page, no browser):
// every form the scan promises to find is found inside other text, and
// `redact` removes every one of them.

import { expect, test } from "@playwright/test";

import {
  contains,
  needlesOf,
  redact,
  type Needle,
} from "./harness/secret-needles.ts";

// "?" and ">" make base64 differ from base64url and URL-encoding differ from raw.
const TEXT = "pt_s?cr>t?>~";
const TEXT_BASE64 = Buffer.from(TEXT, "utf8").toString("base64");
const BYTES = Uint8Array.from([0xfb, 0xff, 0x00, 0x10, 0xab, 0xcd, 0xef, 0x7f]);
const BYTES_HEX = "fbff0010abcdef7f";
const BYTES_BASE64 = Buffer.from(BYTES).toString("base64");

const STRING_FORMS: readonly (readonly [string, string])[] = [
  ["raw", TEXT],
  ["URL-encoded", encodeURIComponent(TEXT)],
  ["base64", TEXT_BASE64],
  [
    "base64url",
    TEXT_BASE64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""),
  ],
];

const BYTE_FORMS: readonly (readonly [string, string])[] = [
  ["lowercase hex", BYTES_HEX],
  ["uppercase hex", BYTES_HEX.toUpperCase()],
  ["base64", BYTES_BASE64],
  [
    "base64url",
    BYTES_BASE64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""),
  ],
  ["comma-separated decimals", "251,255,0,16,171,205,239,127"],
  ["a decimal number", BigInt(`0x${BYTES_HEX}`).toString(10)],
];

const embedded = (form: string): string => `before ${form} after`;

const found = (needles: readonly Needle[], text: string): boolean =>
  needles.some(needle => contains(text, needle));

test("the forms are distinct, so each case tests its own form", () => {
  expect(new Set(STRING_FORMS.map(([, form]) => form)).size).toBe(4);
  expect(new Set(BYTE_FORMS.map(([, form]) => form)).size).toBe(6);
});

for (const [name, form] of STRING_FORMS) {
  test(`finds and redacts a string ${name}`, () => {
    const needles = needlesOf(TEXT);
    expect(found(needles, embedded(form))).toBe(true);
    expect(redact(embedded(form), needles)).toBe(embedded("[redacted]"));
  });
}

for (const [name, form] of BYTE_FORMS) {
  test(`finds and redacts bytes as ${name}`, () => {
    const needles = needlesOf(BYTES);
    expect(found(needles, embedded(form))).toBe(true);
    expect(redact(embedded(form), needles)).toBe(embedded("[redacted]"));
  });
}

test("finds nothing in text without the secret", () => {
  expect(found(needlesOf(TEXT), "nothing secret here")).toBe(false);
  expect(found(needlesOf(BYTES), "nothing secret here")).toBe(false);
});

test("redacts anything shaped like a launch code or a play token", () => {
  const shaped = `lc_${"a".repeat(43)} and pt_${"B".repeat(43)}`;
  expect(redact(shaped, [])).toBe("[redacted] and [redacted]");
});

test("never makes a needle of an empty secret", () => {
  expect(needlesOf("")).toEqual([]);
  expect(needlesOf(new Uint8Array())).toEqual([]);
});
