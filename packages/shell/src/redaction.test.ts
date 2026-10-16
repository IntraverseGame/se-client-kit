// T-7a (W-4): the token, launch code, and key-holding types print
// `[redacted]` in every form a value is printed.

import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { openTestSession, openWorkedRound } from "./fixtures/session.ts";
import {
  disposeSecret,
  REDACTED,
  redacting,
  revealSecret,
  sealSecret,
} from "./redaction.ts";

// Placeholders: not credentials, only markers to search for.
const TOKEN_TEXT = "fixture-play-token-6f1c2a";
const LAUNCH_TEXT = "fixture-launch-code-9b3e71";

const printings = (value: unknown): readonly string[] => [
  String(value),
  `${value as string}`,
  JSON.stringify(value),
  JSON.stringify({ nested: [value] }),
  inspect(value),
  inspect({ nested: [value] }, { depth: 10, showHidden: true }),
];

describe("sealed secrets", () => {
  it.each([
    ["play-token", TOKEN_TEXT],
    ["launch-code", LAUNCH_TEXT],
  ] as const)("a %s prints only [redacted]", (kind, text) => {
    const secret = sealSecret(kind, text);
    for (const printed of printings(secret)) {
      expect(printed).toContain(REDACTED);
      expect(printed).not.toContain(text);
    }
  });

  it("concatenation prints [redacted]", () => {
    const secret = sealSecret("play-token", TOKEN_TEXT);
    expect(`Bearer ${String(secret)}`).toBe(`Bearer ${REDACTED}`);
  });

  it("carries nothing a walk or a clone can read", () => {
    const secret = sealSecret("play-token", TOKEN_TEXT);
    expect(Object.keys(secret)).toEqual([]);
    expect(Reflect.ownKeys(secret)).toEqual([]);
    expect(JSON.stringify(structuredClone(secret))).not.toContain(TOKEN_TEXT);
    expect(Object.isFrozen(secret)).toBe(true);
  });

  it("reveals its text only through revealSecret, until disposed", () => {
    const secret = sealSecret("launch-code", LAUNCH_TEXT);
    expect(revealSecret(secret)).toBe(LAUNCH_TEXT);
    disposeSecret(secret);
    expect(() => revealSecret(secret)).toThrow(TypeError);
  });

  it("refuses to reveal a value that was never sealed", () => {
    const forged = redacting({});
    expect(() => revealSecret(forged as never)).toThrow(TypeError);
  });
});

describe("objects that hold the key", () => {
  it("the session prints [redacted]", async () => {
    const session = await openTestSession();
    session.address();
    for (const printed of printings(session)) {
      expect(printed).toContain(REDACTED);
    }
  });

  it("a round's transcript state prints [redacted]", async () => {
    const session = await openTestSession();
    const round = openWorkedRound(session);
    for (const printed of printings(round)) {
      expect(printed).toContain(REDACTED);
    }
  });

  it("is frozen: nothing can be attached to it", async () => {
    const session = await openTestSession();
    expect(Object.isFrozen(session)).toBe(true);
    expect(() => {
      Object.assign(session, { extra: 1 });
    }).toThrow(TypeError);
  });
});
