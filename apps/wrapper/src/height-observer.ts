// The height the operator page is told (W-49d): the height the content needs,
// the `<body>`'s own box (`getBoundingClientRect().height`; the Wrapper's
// stylesheet sets no height on `html` or `body` and no body margin, so it
// holds the content and its padding and never the viewport), or the document
// element's `scrollHeight` where there is no body. `scrollHeight` alone is
// never below the viewport, so a content that shrinks would not be reported
// smaller. Measured once right after `welcome`, then whenever the
// layout's size changes (observed with `ResizeObserver`), at most once per
// animation frame. The operator channel drops a value equal to the last one
// sent and bounds it. The platform is injected, so tests drive the frames.

/** The platform parts the observer uses. */
export type HeightPlatform = {
  readonly doc: Document;
  readonly createObserver: (onResize: () => void) => {
    readonly observe: (element: Element) => void;
  };
  readonly requestFrame: (callback: () => void) => void;
};

/** Measures now, then on every size change, coalesced per frame. */
export const observeHeight = (
  platform: HeightPlatform,
  onHeight: (height: number) => void,
): void => {
  const { doc } = platform;
  let scheduled = false;
  const measure = (): void => {
    scheduled = false;
    onHeight(
      doc.body === null
        ? doc.documentElement.scrollHeight
        : doc.body.getBoundingClientRect().height,
    );
  };
  const observer = platform.createObserver(() => {
    if (scheduled) return;
    scheduled = true;
    platform.requestFrame(measure);
  });
  observer.observe(doc.documentElement);
  if (doc.body !== null) observer.observe(doc.body);
  measure();
};
