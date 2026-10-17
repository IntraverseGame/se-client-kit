// The automated accessibility audit of T-14: an axe scan with
// `@axe-core/playwright` against the WCAG 2.2 A and AA rules (axe's `wcag2a`,
// `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` tags). axe's best-practice
// rules are left out: they are advice, not the criteria W-45 names. An audit
// covers the page and its frames; the keyboard-only play, focus, and live
// region checks of T-14 and T-14a are browser tests of their own.

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const WCAG_TAGS: readonly string[] = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

/** One failed rule, with the elements that fail it. */
export type AxeViolation = {
  readonly rule: string;
  readonly impact: string;
  readonly help: string;
  readonly targets: readonly string[];
};

export type AuditOptions = {
  /** A CSS selector to limit the audit to, such as one state's region. */
  readonly include?: string;
};

/** The WCAG violations axe finds on `page` now. */
export const auditAccessibility = async (
  page: Page,
  options: AuditOptions = {},
): Promise<readonly AxeViolation[]> => {
  const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  const scoped =
    options.include === undefined ? builder : builder.include(options.include);
  const { violations } = await scoped.analyze();
  return violations.map(violation => ({
    rule: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    targets: violation.nodes.map(node => node.target.join(" ")),
  }));
};
