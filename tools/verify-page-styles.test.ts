// V-14 (specs/verify-page.md): the verify page's stylesheet honours reduced
// motion, keeps focus visible, sizes in rem so the page reflows at 200 % zoom,
// and makes every control at least 44 by 44 CSS pixels (V-14 asks 24). The
// real zoom and the axe scan run in the browser suite (VT-7).

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readText } from "./workspace.ts";

const css = readText(
  join(import.meta.dirname, ".."),
  "apps/verify/src/styles.css",
);

describe("the verify page's stylesheet (V-14)", () => {
  it("honours reduced motion and keeps focus visible", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(":focus-visible");
  });

  it("sizes in rem, apart from the visually-hidden helper", () => {
    const rules = css
      .split("}")
      .filter(rule => !rule.includes("vp-visually-hidden"));
    expect(rules.filter(rule => /\d+px/u.test(rule))).toEqual([]);
  });

  it("makes every control at least 2.75rem square", () => {
    expect(css).toMatch(
      /\.vp-button,\s*\.vp-copy\s*\{[^}]*min-width: 2\.75rem;[^}]*min-height: 2\.75rem;/u,
    );
  });
});
