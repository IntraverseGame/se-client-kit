// T-22 (#146, W-53): one presentation per session. The first validated
// Snapshot fixes the session's presentation, model, `config.kind`, and
// `config.model`; a later one in which any of the four differs is a changed
// session, kept once with the first and the differing values only, and final.

import { describe, expect, it } from "vitest";

import { bookInput, bookSnapshot, configOf } from "./fixtures/book.ts";
import { snapshot, validated } from "./fixtures/vectors.ts";
import { createPresentationGuard } from "./session-presentation.ts";

const BOOK = {
  presentation: "playback",
  model: "book",
  configKind: "book",
  configModel: "base",
} as const;

const STEPS = {
  presentation: "steps",
  model: "config",
  configKind: "steps",
  configModel: undefined,
} as const;

/** A book `idle` Snapshot whose `config.model` is `model`. */
const bookOfModel = (model: string): ReturnType<typeof bookSnapshot> => {
  const input = bookInput("idle");
  configOf(input)["model"] = model;
  return validated(input);
};

describe("the session's presentation (W-53)", () => {
  it("is fixed by the first validated Snapshot, and a Snapshot alike is admitted", () => {
    const guard = createPresentationGuard();
    expect(guard.admit(bookSnapshot("idle"))).toBe(true);
    expect(guard.admit(bookSnapshot("starting"))).toBe(true);
    expect(guard.admit(bookSnapshot("won"))).toBe(true);
    expect(guard.change()).toBeUndefined();
  });

  it("a steps session stays a steps session across games of one presentation", () => {
    const guard = createPresentationGuard();
    expect(guard.admit(snapshot("idle"))).toBe(true);
    expect(guard.admit(snapshot("active"))).toBe(true);
    expect(guard.change()).toBeUndefined();
  });

  it("a book Snapshot after a steps one changes the session, final until a reload", () => {
    const guard = createPresentationGuard();
    guard.admit(snapshot("idle"));
    expect(guard.admit(bookSnapshot("idle"))).toBe(false);
    expect(guard.change()).toEqual({ first: STEPS, changed: BOOK });
    // Final: nothing is admitted after, a Snapshot like the first included.
    expect(guard.admit(snapshot("idle"))).toBe(false);
    expect(guard.admit(bookSnapshot("idle"))).toBe(false);
    expect(guard.change()).toEqual({ first: STEPS, changed: BOOK });
  });

  it("a steps Snapshot after a book one changes the session", () => {
    const guard = createPresentationGuard();
    guard.admit(bookSnapshot("idle"));
    expect(guard.admit(snapshot("active"))).toBe(false);
    expect(guard.change()).toEqual({ first: BOOK, changed: STEPS });
  });

  it("another config.model changes the session", () => {
    const guard = createPresentationGuard();
    guard.admit(bookSnapshot("idle"));
    expect(guard.admit(bookOfModel("bonus"))).toBe(false);
    expect(guard.change()).toEqual({
      first: BOOK,
      changed: { ...BOOK, configModel: "bonus" },
    });
  });

  it("keeps the four fields and nothing else of the Snapshot", () => {
    const guard = createPresentationGuard();
    guard.admit(bookSnapshot("won"));
    guard.admit(snapshot("won"));
    const change = guard.change();
    // Strict: no member beyond the four fields, an undefined one included.
    expect(change).toStrictEqual({ first: BOOK, changed: STEPS });
    const text = JSON.stringify(change);
    expect(text).not.toContain("ses_");
    expect(text).not.toContain("0x");
    expect(text).not.toContain("€");
  });
});
