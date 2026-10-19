// The height the operator page is told (W-49d): the document's
// `scrollHeight`, measured once right after `welcome`, then whenever the
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
    onHeight(doc.documentElement.scrollHeight);
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
