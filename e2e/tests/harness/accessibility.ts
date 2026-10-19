// The automated accessibility audit of T-14: an axe scan with
// `@axe-core/playwright` against the WCAG 2.2 A and AA rules (axe's `wcag2a`,
// `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` tags). axe's best-practice
// rules are left out: they are advice, not the criteria W-45 names. An audit
// covers the page and its frames; the keyboard-only play, focus, and live
// region checks of T-14 and T-14a are browser tests of their own.
//
// axe resolves each rule with a page `setTimeout(…, 0)`, so in a test that
// installs `page.clock` the audit runs only while that clock moves: with the
// clock paused it never finishes (proven in accessibility.spec.ts). One audit
// was once seen to hang that way after a `page.clock.runFor`, past the test's
// own timeout, with no cause found. So an audit is bounded in real time (the
// runner's own timer, which `page.clock` does not touch): past
// `AUDIT_LIMIT_MS` it fails the test with that message instead of hanging the
// run.

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
  /** The real-time bound of the audit (`AUDIT_LIMIT_MS` by default). */
  readonly limitMs?: number;
};

/** How long an audit may run, in real time, before it fails the test. */
export const AUDIT_LIMIT_MS = 20_000;

/** `run`, or a rejection once `ms` of real time passed without it. */
const withinLimit = async <T>(run: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`the accessibility audit did not finish in ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run, limit]);
  } finally {
    clearTimeout(timer);
  }
};

/** The WCAG violations axe finds on `page` now. */
export const auditAccessibility = async (
  page: Page,
  options: AuditOptions = {},
): Promise<readonly AxeViolation[]> => {
  const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  const scoped =
    options.include === undefined ? builder : builder.include(options.include);
  const { violations } = await withinLimit(
    scoped.analyze(),
    options.limitMs ?? AUDIT_LIMIT_MS,
  );
  return violations.map(violation => ({
    rule: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    targets: violation.nodes.map(node => node.target.join(" ")),
  }));
};
