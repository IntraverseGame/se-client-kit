// T-33, where the bar sits and the band it covers (RFC-005 section 1, W-38's
// `layout`, W-49d): the bar floats only where the stylesheet allows it and
// floating leaves at least the stage's minimum (and never less than 200 CSS
// pixels) of the game in view, else it docks with an inset of 0; the inset is
// the bar and its gap, rounded up, only over a game that declared `inset`;
// `H_min` follows the capability (an apron adds the gap above the bar too).
// And the wiring: a capable `hello` gives the frame the whole stage and sends
// the band; a later change is sent through the mount's `layout`.

import type { GameMountOptions } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { type Wired, wired } from "./fixtures/wired.ts";
import {
  createStageLayout,
  layoutOf,
  MIN_VISIBLE_GAME,
  type LayoutInput,
} from "./stage-layout.ts";

const WIDE: LayoutInput = {
  wide: true,
  frame: "inset",
  mainHeight: 720,
  barHeight: 88,
  gap: 14,
  stageMinimum: 270,
};

describe("layoutOf (T-33)", () => {
  it("floats over an inset game and names the band: the bar and its gap", () => {
    expect(layoutOf(WIDE)).toEqual({
      floating: true,
      insetBottom: 102,
      minimum: 102 + 270,
    });
  });

  it("rounds the band up to a whole CSS pixel", () => {
    expect(layoutOf({ ...WIDE, barHeight: 88.2 }).insetBottom).toBe(103);
  });

  it("floats over an apron with an inset of 0, its minimum the bar and both gaps", () => {
    expect(layoutOf({ ...WIDE, frame: "apron" })).toEqual({
      floating: true,
      insetBottom: 0,
      minimum: 116 + 270,
    });
  });

  it("docks on a narrower screen, with an inset of 0", () => {
    expect(layoutOf({ ...WIDE, wide: false, barHeight: 150 })).toEqual({
      floating: false,
      insetBottom: 0,
      minimum: 150 + 270,
    });
  });

  it("docks when floating would leave less than the stage's minimum of the game", () => {
    expect(layoutOf({ ...WIDE, mainHeight: 102 + 269 }).floating).toBe(false);
    expect(layoutOf({ ...WIDE, mainHeight: 102 + 270 }).floating).toBe(true);
  });

  it("never leaves less than 200 CSS pixels of the game, whatever the stage's minimum", () => {
    const low = { ...WIDE, stageMinimum: 100 };
    expect(
      layoutOf({ ...low, mainHeight: 102 + MIN_VISIBLE_GAME - 1 }),
    ).toMatchObject({ floating: false, insetBottom: 0 });
    expect(
      layoutOf({ ...low, mainHeight: 102 + MIN_VISIBLE_GAME }).floating,
    ).toBe(true);
  });
});

/** A box of `height()`'s height, as `getBoundingClientRect` gives it. */
const box = (height: () => number) => (): DOMRect =>
  ({ height: height() }) as DOMRect;

/** A page of the UI's three elements, with sizes the test sets. */
const page = (frame: "inset" | "apron", mainHeight: number) => {
  const doc = globalThis.document;
  doc.body.replaceChildren();
  const main = doc.createElement("main");
  main.className = "se-main";
  const stage = doc.createElement("div");
  stage.className = "se-stage";
  stage.dataset["frame"] = frame;
  const bar = doc.createElement("div");
  bar.className = "se-bar";
  main.append(stage, bar);
  doc.body.append(main);
  const size = { main: mainHeight };
  main.getBoundingClientRect = box(() => size.main);
  bar.getBoundingClientRect = box(() => 88);
  const resized: (() => void)[] = [];
  const layout = createStageLayout({
    doc,
    createObserver: onResize => {
      resized.push(onResize);
      return { observe: () => {} };
    },
    onViewportResize: onResize => {
      resized.push(onResize);
    },
    floatable: () => true,
    gapOf: () => 14,
    minHeightOf: () => 270,
  });
  return { main, stage, layout, size, resized };
};

describe("createStageLayout (T-33)", () => {
  it("marks the bar float or dock, and tells each new band", () => {
    const { main, layout, size, resized } = page("inset", 720);
    const insets: number[] = [];
    layout.onInset(inset => insets.push(inset));
    expect(main.dataset["bar"]).toBe("float");
    expect(layout.measure()).toBe(102);
    expect(layout.minimum()).toBe(372);
    size.main = 300;
    for (const onResize of resized) onResize();
    expect(main.dataset["bar"]).toBe("dock");
    expect(insets).toEqual([0]);
  });

  it("follows the stage's frame mode: an apron's band is 0", () => {
    const { stage, layout } = page("inset", 720);
    stage.dataset["frame"] = "apron";
    expect(layout.measure()).toBe(0);
    expect(layout.minimum()).toBe(116 + 270);
  });
});

/** A stage layout the test drives: its band, and the values it sends. */
const fakeLayout = () => {
  let inset = 0;
  const listeners: ((value: number) => void)[] = [];
  return {
    layout: {
      measure: () => inset,
      minimum: () => 0,
      onInset: (listener: (value: number) => void) => {
        listeners.push(listener);
      },
    },
    set: (value: number): void => {
      inset = value;
      for (const listener of listeners) listener(value);
    },
  };
};

/** A wired UI over `fakeLayout`, recording each `layout` the mount sends. */
const capable = async (): Promise<
  Wired & {
    readonly sent: number[];
    readonly set: (value: number) => void;
    readonly mounted: () => GameMountOptions;
  }
> => {
  const fake = fakeLayout();
  const sent: number[] = [];
  let options: GameMountOptions | undefined;
  const ui = await wired(
    session => {
      session.setMount(given => {
        options = given;
        return {
          ok: true,
          gameOrigin: "https://game.example.net",
          gamePath: "/",
          layout: value => sent.push(value),
        };
      });
    },
    { layout: fake.layout },
  );
  return {
    ...ui,
    sent,
    set: fake.set,
    mounted: () => {
      if (options === undefined) throw new Error("not mounted");
      return options;
    },
  };
};

describe("the inset capability through the session's wiring (T-33, W-38)", () => {
  it("gives a capable game the whole stage and the band, then each change", async () => {
    const ui = await capable();
    const options = ui.mounted();
    const stage = ui.host.querySelector<HTMLElement>(".se-stage");
    expect(stage?.dataset["frame"]).toBe("apron");
    ui.set(102);
    options.onCapabilities?.(["inset"]);
    expect(stage?.dataset["frame"]).toBe("inset");
    expect(options.insetBottom?.()).toBe(102);
    ui.set(0);
    expect(ui.sent).toEqual([102, 0]);
  });

  it("keeps the apron for a game without the capability", async () => {
    const ui = await capable();
    ui.mounted().onCapabilities?.([]);
    expect(
      ui.host.querySelector<HTMLElement>(".se-stage")?.dataset["frame"],
    ).toBe("apron");
  });
});
