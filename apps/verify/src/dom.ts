// DOM helpers of the verify page. Elements are built with `createElement`,
// attributes with `setAttribute`, and text with text nodes only: no markup
// string, no `innerHTML`, and no inline style, so every value from the network
// is text and the page's policy (Trusted Types required) holds.

/** A child of an element; `undefined` and `false` are left out. */
export type Child = Node | string | undefined | false;

/** An element factory bound to a document. */
export const elementBuilder = (doc: Document) => {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Readonly<Record<string, string>> = {},
    children: readonly Child[] = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    for (const child of children) {
      if (child !== undefined && child !== false) {
        element.append(child);
      }
    }
    return element;
  };
  return el;
};

export type Builder = ReturnType<typeof elementBuilder>;

export type IconName =
  | "matches"
  | "mismatch"
  | "unverified"
  | "not-checked"
  | "error"
  | "info"
  | "progress";

const SVG = "http://www.w3.org/2000/svg";

// One path per icon, on a 24 by 24 grid, drawn with `currentColor`.
const PATHS: Readonly<Record<IconName, string>> = {
  matches: "M4 12.5l5 5L20 6.5",
  mismatch: "M6 6l12 12M18 6L6 18",
  unverified: "M12 3l10 18H2L12 3zM12 10v5M12 18v.5",
  "not-checked": "M5 12h14",
  error: "M12 3l10 18H2L12 3zM12 10v5M12 18v.5",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5",
  progress: "M12 3a9 9 0 1 0 9 9",
};

/**
 * An icon with the text alternative `label` (`role="img"`): match and mismatch
 * never rest on colour alone (V-14).
 */
export const icon = (doc: Document, name: IconName, label: string): Element => {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", `vp-icon vp-icon--${name}`);
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
