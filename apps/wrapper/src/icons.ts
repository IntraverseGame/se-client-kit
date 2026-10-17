// The status icons (W-47): colour never carries meaning alone, so win, loss,
// error, and the other states each have an icon with a text alternative beside
// their text. Icons are built as DOM nodes (no markup string, no inline style),
// which the Content Security Policy allows.

export type IconName = "win" | "loss" | "error" | "info" | "progress";

const SVG = "http://www.w3.org/2000/svg";

// One path per icon, on a 24 by 24 grid, drawn with `currentColor`.
const PATHS: Readonly<Record<IconName, string>> = {
  win: "M4 12.5l5 5L20 6.5",
  loss: "M6 6l12 12M18 6L6 18",
  error: "M12 3l10 18H2L12 3zM12 10v5M12 18v.5",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5",
  progress: "M12 3a9 9 0 1 0 9 9",
};

/** An icon whose text alternative is `label` (`role="img"`). */
export const icon = (doc: Document, name: IconName, label: string): Element => {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", `se-icon se-icon--${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("focusable", "false");
  const path = doc.createElementNS(SVG, "path");
  path.setAttribute("d", PATHS[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
};
