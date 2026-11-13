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

/** The bar's decorative glyphs (RFC-005): each sits beside its own text. */
export type GlyphName =
  | "shield"
  | "shield-ok"
  | "shield-off"
  | "menu"
  | "minus"
  | "plus"
  | "stop"
  | "up";

const GLYPHS: Readonly<Record<GlyphName, string>> = {
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z",
  "shield-ok":
    "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM8.8 12.2l2.2 2.2 4.4-4.6",
  "shield-off":
    "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM12 8v5M12 16v.5",
  menu: "M4 7h16M4 12h16M4 17h10",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  stop: "M8 8h8v8H8z",
  up: "M12 19V5M6 11l6-6 6 6",
};

/** A glyph hidden from assistive technology: the text beside it says it. */
export const glyph = (doc: Document, name: GlyphName): Element => {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", `se-glyph se-glyph--${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = doc.createElementNS(SVG, "path");
  path.setAttribute("d", GLYPHS[name]);
  path.setAttribute("fill", name === "stop" ? "currentColor" : "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
};
