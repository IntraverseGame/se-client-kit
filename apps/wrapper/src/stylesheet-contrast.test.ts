// The bar's contrast (W-47, RFC-005 section 9, T-35), by the Wrapper's WCAG 2.2
// AA target (specs/wrapper.md, Accessibility): one dark theme (Q7); text at
// 4.5:1 on the bar, its controls, and its popovers; the start control's label
// on the accent; the focus ring and the problem colour at 3:1 (1.4.11); and
// the floating bar's glass: its surface composited over a white game and over
// a black one (the worst cases) after its backdrop is dimmed, with its text and
// labels at 4.5:1 over both, and its backdrop dimmed and blurred enough that a
// game drawing under it cannot make its own text read as the bar's. The rest of the stylesheet's rules are in accessibility.test.ts.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(`${import.meta.dirname}/styles.css`, "utf8");

// luminance and contrast are copied from apps/reference-game/src/
// accessibility.test.ts: apps may not import each other.

/** The `#rrggbb` custom properties of the `:root` block. */
const tokens = (): Map<string, string> => {
  const start = stylesheet.indexOf(":root {");
  const body =
    start === -1 ? "" : stylesheet.slice(start, stylesheet.indexOf("}", start));
  return new Map(
    [...body.matchAll(/(--se-[\w-]+):\s*(#[0-9a-f]{6});/gu)].map(
      match => [match[1] ?? "", match[2] ?? ""] as const,
    ),
  );
};

type Rgb = readonly [number, number, number];

const rgbOf = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** The WCAG relative luminance of a colour. */
const luminance = (rgb: Rgb): number => {
  const [r = 0, g = 0, b = 0] = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.039_28
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two colours. */
const contrast = (a: Rgb, b: Rgb): number => {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const token = (name: string): Rgb => {
  const hex = tokens().get(name);
  if (hex === undefined) throw new Error(`no token ${name}`);
  return rgbOf(hex);
};

/** The glass token's colour and opacity: `rgb(r g b / a)`. */
const glass = (): { readonly rgb: Rgb; readonly alpha: number } => {
  const match = /--se-glass: rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\);/u.exec(
    stylesheet,
  );
  if (match === null) throw new Error("no glass token");
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
};

/** A plain number custom property of the stylesheet, such as `--se-glass-dim`. */
const number = (name: string, unit = ""): number => {
  const match = new RegExp(`${name}: ([\\d.]+)${unit};`, "u").exec(stylesheet);
  if (match === null) throw new Error(`no ${name}`);
  return Number(match[1]);
};

/** The glass over a backdrop of one colour, the backdrop dimmed first. */
const over = (backdrop: Rgb): Rgb => {
  const { rgb, alpha } = glass();
  const dim = number("--se-glass-dim");
  return [0, 1, 2].map(
    at => (rgb[at] ?? 0) * alpha + (backdrop[at] ?? 0) * dim * (1 - alpha),
  ) as unknown as Rgb;
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

describe("the bar's contrast (W-47, RFC-005)", () => {
  it("has one dark theme (Q7)", () => {
    expect(stylesheet).toMatch(/color-scheme: dark;/u);
    expect(stylesheet).not.toMatch(/prefers-color-scheme/u);
  });

  it.each(["--se-bar", "--se-control", "--se-popover", "--se-page"])(
    "keeps text and labels at 4.5:1 on %s",
    surface => {
      expect(contrast(token("--se-fg"), token(surface))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(token("--se-muted"), token(surface)),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("keeps the start control's label at 4.5:1 on the accent, busy too", () => {
    expect(
      contrast(token("--se-on-accent"), token("--se-accent")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("--se-on-accent"), token("--se-accent-deep")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("--se-on-busy"), token("--se-busy")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the accent and the problem colour at 3:1 on the bar (1.4.11)", () => {
    for (const colour of ["--se-accent", "--se-problem"]) {
      expect(contrast(token(colour), token("--se-bar"))).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("dims and blurs the glass's backdrop, its floor against contrast loss and spoofing", () => {
    expect(number("--se-glass-dim")).toBeLessThanOrEqual(0.4);
    expect(number("--se-glass-blur", "rem")).toBeGreaterThanOrEqual(1.25);
    expect(glass().alpha).toBeGreaterThanOrEqual(0.4);
    expect(stylesheet).toMatch(
      /backdrop-filter: blur\(var\(--se-glass-blur\)\)[^;]*brightness\(var\(--se-glass-dim\)\);/u,
    );
  });

  it.each([
    ["white", WHITE],
    ["black", BLACK],
  ])(
    "keeps text and labels at 4.5:1 on the glass over a %s game",
    (_, backdrop) => {
      for (const text of ["--se-fg", "--se-muted-glass"]) {
        expect(contrast(token(text), over(backdrop))).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it("draws the focus ring in the accent, 2 px, on every control", () => {
    expect(stylesheet).toMatch(
      /:focus-visible \{\s*outline: 0\.125rem solid var\(--se-accent\);/u,
    );
  });
});
