// The game's side of the `inset` capability (RFC-005, W-38): it declares
// `inset` in its `hello`; a `layout` sets the band its interface stays above
// (the page's `--rg-inset`, read by the stylesheet's body padding); with no
// `layout` within `LAYOUT_TIMEOUT_MS` it says a plain `hello` once and lays out
// with a band of 0; a `layout` that came in time stops the fallback; a
// stopped game sends nothing more. The timers are fakes the test fires.

import { describe, expect, it } from "vitest";

import { fakeParent, PARENT_ORIGIN } from "./fixtures/parent.ts";
import { type GameTimers, LAYOUT_TIMEOUT_MS } from "./inset.ts";
import { mountGame } from "./mount.ts";
import { helloMessage, parseWrapperMessage, SCHEMA } from "./protocol.ts";

type Timer = { readonly callback: () => void; readonly ms: number };

const fakeTimers = (): GameTimers & { readonly pending: Timer[] } => {
  const pending: Timer[] = [];
  return {
    pending,
    setTimeout: (callback, ms) => {
      const timer = { callback, ms };
      pending.push(timer);
      return timer;
    },
    clearTimeout: handle => {
      const at = pending.indexOf(handle as Timer);
      if (at !== -1) pending.splice(at, 1);
    },
  };
};

const mounted = () => {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  document.documentElement.style.removeProperty("--rg-inset");
  delete document.documentElement.dataset["inset"];
  const parent = fakeParent();
  const timers = fakeTimers();
  const game = mountGame({
    doc: document,
    host,
    parent: parent.window,
    parentOrigin: PARENT_ORIGIN,
    listen: parent.listen,
    timers,
  });
  return { parent, timers, game };
};

const layout = (insetBottom: number): unknown => ({
  schema: SCHEMA,
  type: "layout",
  insetBottom,
});

const inset = (): string | undefined =>
  document.documentElement.dataset["inset"];

describe("the inset capability (RFC-005)", () => {
  it("declares inset in its hello and waits for layout", () => {
    const { parent, timers } = mounted();
    expect(parent.posted.map(({ message }) => message)).toEqual([
      helloMessage(),
    ]);
    expect(timers.pending.map(timer => timer.ms)).toEqual([LAYOUT_TIMEOUT_MS]);
  });

  it("keeps its interface above each band layout gives, and stops the fallback", () => {
    const { parent, timers } = mounted();
    parent.send(layout(102));
    expect(inset()).toBe("102");
    expect(document.documentElement.style.getPropertyValue("--rg-inset")).toBe(
      "102px",
    );
    expect(timers.pending).toEqual([]);
    parent.send(layout(0));
    expect(inset()).toBe("0");
    expect(parent.posted).toHaveLength(1);
  });

  it("falls back to a plain hello, once, when no layout arrives in time", () => {
    const { parent, timers } = mounted();
    timers.pending[0]?.callback();
    expect(parent.posted.map(({ message }) => message)).toEqual([
      helloMessage(),
      helloMessage(false),
    ]);
    expect(inset()).toBe("0");
  });

  it("never falls back on a missing snapshot once layout came", () => {
    const { parent, timers } = mounted();
    parent.send(layout(88));
    expect(timers.pending).toEqual([]);
    expect(parent.posted).toHaveLength(1);
  });

  it("takes a layout only from its parent, and stops the timer when closed", () => {
    const { parent, timers, game } = mounted();
    parent.send(layout(50), { origin: "https://elsewhere.example.test" });
    expect(inset()).toBeUndefined();
    game.close();
    expect(timers.pending).toEqual([]);
  });

  it("takes a layout with a whole, non-negative insetBottom (RFC-005)", () => {
    for (const insetBottom of [0, 102]) {
      const data = { schema: "se.controller/1", type: "layout", insetBottom };
      expect(parseWrapperMessage(data)).toEqual(data);
    }
    for (const insetBottom of [-1, 1.5, "102", Number.NaN, undefined]) {
      expect(
        parseWrapperMessage({
          schema: "se.controller/1",
          type: "layout",
          insetBottom,
        }),
      ).toBeUndefined();
    }
    expect(
      parseWrapperMessage({
        schema: "se.controller/1",
        type: "layout",
        insetBottom: 0,
        colour: "#000",
      }),
    ).toBeUndefined();
  });
});
