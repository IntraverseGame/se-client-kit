// The game page's accessibility, by the Wrapper's rules where they apply
// (W-45 to W-48): one polite live region, an alert for a reject, text labels,
// no px sizes, 44 px targets, visible focus, reduced motion, and a held call
// that looks held within WCAG AA contrast on both themes. The axe audit of the
// page runs in the browser suite (reference-game-smoke.spec.ts).

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CASH_OR_CRASH } from "./fixtures/cash-or-crash.ts";
import { mount } from "./fixtures/page.ts";
import { SNAPSHOTS, snapshotMessage } from "./fixtures/snapshots.ts";
import { HEADING_ID } from "./render.ts";

/**
 * The custom properties declared in the stylesheet block that opens with
 * `opening`.
 */
const tokensOf = (css: string, opening: string): Map<string, string> => {
  const start = css.indexOf(opening);
  const body = start === -1 ? "" : css.slice(start, css.indexOf("}", start));
  return new Map(
    [...body.matchAll(/(--rg-[\w-]+):\s*(#[0-9a-f]{6});/gu)].map(
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

/** The text of the label an element names with `aria-labelledby`. */
const labelTextOf = (host: HTMLElement, element: Element): string | null =>
  host.querySelector(`#${element.getAttribute("aria-labelledby") ?? ""}`)
    ?.textContent ?? null;

describe("accessibility", () => {
  const stylesheet = readFileSync(`${import.meta.dirname}/styles.css`, "utf8");

  it("has one polite, atomic live region with the heading, and one alert", () => {
    const { host } = mount();
    const live = host.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0]?.getAttribute("aria-atomic")).toBe("true");
    expect(live[0]?.querySelector(`#${HEADING_ID}`)).not.toBeNull();
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it("labels every control with text, and the calls as a group", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(SNAPSHOTS.active));
    for (const button of host.querySelectorAll("button")) {
      expect(button.textContent?.trim()).not.toBe("");
      expect(button.getAttribute("type")).toBe("button");
    }
    const group = host.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-labelledby")).toBe("rg-calls-label");
    expect(host.querySelector("#rg-calls-label")?.textContent).toBe(
      "Your call",
    );
  });

  it("labels every row of a steps round as a group, and every tile with its text", () => {
    const { parent, host } = mount();
    parent.send(snapshotMessage(CASH_OR_CRASH.active));
    const groups = host.querySelectorAll('.rg-row[role="group"]');
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(labelTextOf(host, group)).toMatch(/^Row \d/u);
    }
    const tiles = host.querySelectorAll(".rg-tile");
    expect(tiles).toHaveLength(10);
    for (const tile of tiles) {
      expect(tile.textContent).toMatch(/^Tile \d/u);
      expect(tile.getAttribute("type")).toBe("button");
    }
    expect(host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("gives a tile the same sizes, focus, and held look as a call", () => {
    expect(stylesheet).toMatch(/\.rg-tile \{[^}]*flex: 1 1 5rem/u);
    expect(stylesheet).not.toMatch(/\.rg-tile[^{]*\{[^}]*height:/u);
  });

  it.each([
    [":root {", "light"],
    [':root[data-theme="dark"] {', "dark"],
    [':root:not([data-theme="light"]) {', "dark (system preference)"],
  ])("keeps a held call within WCAG AA in the %s block (%s)", block => {
    const tokens = tokensOf(stylesheet, block);
    const page = tokens.get("--rg-bg");
    expect(
      contrast(tokens.get("--rg-disabled-fg"), tokens.get("--rg-disabled-bg")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tokens.get("--rg-disabled-border"), page),
    ).toBeGreaterThanOrEqual(3);
    expect(stylesheet).toMatch(
      /\.rg-button\[aria-disabled="true"\] \{[^}]*background: var\(--rg-disabled-bg\)/u,
    );
  });

  it("sizes in rem, with 44 px targets, visible focus, and reduced motion", () => {
    const lines = stylesheet.split("\n");
    const px = lines.filter(line => /\d+px/u.test(line));
    // The visually-hidden helper's 1px box is the one exception.
    expect(px.every(line => /\b1px\b/u.test(line))).toBe(true);
    expect(stylesheet).toMatch(/min-height: 2\.75rem/u);
    expect(stylesheet).toMatch(/min-width: 2\.75rem/u);
    expect(stylesheet).toMatch(/:focus-visible/u);
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion: reduce\)/u);
  });
});
