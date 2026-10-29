// The bet option's non-text contrast and its forced-colours focus, by the
// Wrapper's WCAG 2.2 AA target (specs/wrapper.md, Accessibility; 1.4.11) and
// W-45's visible focus (2.4.7): an unselected option is marked only by its
// border, so the border keeps 3:1 against the page and the status panel on
// both themes; and the checked option, which opts out of forced colours, draws
// its focus outline in a system colour rather than the theme's --se-focus. The
// rest of the stylesheet's rules are in accessibility.test.ts.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(`${import.meta.dirname}/styles.css`, "utf8");

// tokensOf, luminance, and contrast are copied from
// apps/reference-game/src/accessibility.test.ts: apps may not import each
// other.

/**
 * The custom properties declared in the stylesheet block that opens with
 * `opening`.
 */
const tokensOf = (opening: string): Map<string, string> => {
  const start = stylesheet.indexOf(opening);
  const body =
    start === -1 ? "" : stylesheet.slice(start, stylesheet.indexOf("}", start));
  return new Map(
    [...body.matchAll(/(--se-[\w-]+):\s*(#[0-9a-f]{6});/gu)].map(
      match => [match[1] ?? "", match[2] ?? ""] as const,
    ),
  );
};

/** The WCAG relative luminance of a `#rrggbb` colour. */
const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(at => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.039_28
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two colours (0 when one is missing). */
const contrast = (a: string | undefined, b: string | undefined): number => {
  if (a === undefined || b === undefined) return 0;
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

/** Where the forced-colours block starts in the stylesheet (-1 if absent). */
const forcedColorsAt = (): number =>
  stylesheet.indexOf("@media (forced-colors: active)");

/** Where the choice's focus rule starts in the stylesheet (-1 if absent). */
const focusRuleAt = (): number =>
  stylesheet.indexOf(".se-choice:has(input:focus-visible) {");

/** The declarations of the checked option's rule under forced colours. */
const forcedCheckedRule = (): string =>
  /\.se-choice:has\(input:checked\) \{([^}]*)\}/u.exec(
    stylesheet.split("@media (forced-colors: active)")[1] ?? "",
  )?.[1] ?? "";

describe("the bet option's contrast (W-45, W-47)", () => {
  it.each([
    [":root {", "light"],
    ["@media (prefers-color-scheme: dark) {", "dark"],
  ])(
    "keeps an unselected option's border at 3:1 in the %s block (%s)",
    block => {
      const tokens = tokensOf(block);
      const border = tokens.get("--se-control-border");
      expect(contrast(border, tokens.get("--se-bg"))).toBeGreaterThanOrEqual(3);
      expect(contrast(border, tokens.get("--se-panel"))).toBeGreaterThanOrEqual(
        3,
      );
    },
  );

  it("draws an option's border in the control border token", () => {
    expect(stylesheet).toMatch(
      /\.se-choice \{[^}]*border: 0\.0625rem solid var\(--se-control-border\);/u,
    );
  });

  it("draws the checked option's focus outline in a system colour under forced colours", () => {
    expect(forcedCheckedRule()).toMatch(/forced-color-adjust: none;/u);
    expect(forcedCheckedRule()).toMatch(/outline-color: CanvasText;/u);
  });

  it("puts the forced-colours block after the focus rule, whose outline shorthand would reset the colour at equal specificity", () => {
    expect(focusRuleAt()).toBeGreaterThan(-1);
    expect(forcedColorsAt()).toBeGreaterThan(focusRuleAt());
  });
});
