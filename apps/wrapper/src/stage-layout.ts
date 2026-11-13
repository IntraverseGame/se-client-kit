// Where the bar sits, and the band of the frame it covers (RFC-005 section 1,
// W-57, W-38's `layout`). On a wide screen (the stylesheet's
// `--se-floatable`) the bar floats over the bottom of the stage, never over
// anything the game needs: a game that declared `inset` gets a frame the size
// of the whole stage and draws only scenery under the bar, told the band's
// height (`insetBottom`); any other game keeps a frame above an apron, a
// neutral band the bar floats on. The bar docks under the stage when the
// screen is narrower, and when floating would leave less than the stage's
// minimum `S` (and never less than 200 CSS pixels, `MIN_VISIBLE_GAME`) of the
// game in view: the inset is then 0. The decision is an attribute on the
// page's main element (`data-bar`, "float" or "dock"), never a measured value
// written into a style; the stage's `data-frame` says "inset" or "apron"
// (render.ts). The frame resizes once after the `hello` and at a layout change,
// never on a status change. The platform is injected, so tests drive it.

/** The least height of the game the bar may leave in view, in CSS pixels. */
export const MIN_VISIBLE_GAME = 200;

export type LayoutInput = {
  /** The stylesheet lets the bar float at this width. */
  readonly wide: boolean;
  readonly frame: "inset" | "apron";
  /** The height of the page's main element: the stage and the bar. */
  readonly mainHeight: number;
  readonly barHeight: number;
  /** The bar's gap to the stage's edges when it floats. */
  readonly gap: number;
  /** The stage's minimum `S` (W-57). */
  readonly stageMinimum: number;
};

export type Layout = {
  readonly floating: boolean;
  /** The `layout` message's value: 0 unless the bar floats over the frame. */
  readonly insetBottom: number;
  /** `H_min` (W-49d): the least height the content needs at this width. */
  readonly minimum: number;
};

/** Where the bar sits, and what that leaves of the game (RFC-005). */
export const layoutOf = (input: LayoutInput): Layout => {
  const { wide, frame, mainHeight, barHeight, gap, stageMinimum } = input;
  // The band under the game's view: the bar and its gap below, and, over an
  // apron, its gap above too.
  const band = barHeight + gap * (frame === "apron" ? 2 : 1);
  const floating =
    wide && mainHeight - band >= Math.max(stageMinimum, MIN_VISIBLE_GAME);
  return {
    floating,
    insetBottom: floating && frame === "inset" ? Math.ceil(barHeight + gap) : 0,
    minimum: Math.ceil(wide ? band : barHeight) + Math.ceil(stageMinimum),
  };
};

/** The platform parts the layout reads. */
export type LayoutPlatform = {
  readonly doc: Document;
  readonly createObserver: (onResize: () => void) => {
    readonly observe: (element: Element) => void;
  };
  readonly onViewportResize: (onResize: () => void) => void;
  /** Whether the stylesheet lets the bar float at the current width. */
  readonly floatable: (bar: Element) => boolean;
  /** The bar's gap to the stage's edges when it floats, in CSS pixels. */
  readonly gapOf: (bar: Element) => number;
  /** An element's computed `min-height`, in CSS pixels. */
  readonly minHeightOf: (element: Element) => number;
};

export type StageLayout = {
  /** Lays out now; answers the band the bar covers (`insetBottom`). */
  readonly measure: () => number;
  /** `H_min` at the last measure (W-49d). */
  readonly minimum: () => number | undefined;
  /** Called with every new `insetBottom`. */
  readonly onInset: (listener: (insetBottom: number) => void) => void;
};

/** Follows the layout as the viewport, the bar, or the stage changes. */
export const createStageLayout = (platform: LayoutPlatform): StageLayout => {
  const { doc } = platform;
  const listeners = new Set<(insetBottom: number) => void>();
  let minimum: number | undefined;
  let inset: number | undefined;
  const measure = (): number => {
    const main = doc.querySelector<HTMLElement>(".se-main");
    const bar = doc.querySelector(".se-bar");
    const stage = doc.querySelector<HTMLElement>(".se-stage");
    if (main === null || bar === null || stage === null) return 0;
    const layout = layoutOf({
      wide: platform.floatable(bar),
      frame: stage.dataset["frame"] === "inset" ? "inset" : "apron",
      mainHeight: main.getBoundingClientRect().height,
      barHeight: bar.getBoundingClientRect().height,
      gap: platform.gapOf(bar),
      stageMinimum: platform.minHeightOf(stage),
    });
    main.dataset["bar"] = layout.floating ? "float" : "dock";
    minimum = layout.minimum;
    if (layout.insetBottom !== inset) {
      inset = layout.insetBottom;
      for (const listener of listeners) listener(inset);
    }
    return layout.insetBottom;
  };
  const observer = platform.createObserver(() => {
    measure();
  });
  for (const selector of [".se-main", ".se-bar"]) {
    const element = doc.querySelector(selector);
    if (element !== null) observer.observe(element);
  }
  platform.onViewportResize(() => {
    measure();
  });
  measure();
  return Object.freeze({
    measure,
    minimum: (): number | undefined => minimum,
    onInset: (listener: (insetBottom: number) => void): void => {
      listeners.add(listener);
    },
  });
};
