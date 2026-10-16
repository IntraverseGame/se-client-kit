// Readers of a validation result, so a test asserts without branching.

import type { ValidationIssue, ValidationResult } from "../index.ts";

/** The issues of a rejection; none for an acceptance. */
export const issuesOf = (
  result: ValidationResult<unknown>,
): readonly ValidationIssue[] => (result.ok ? [] : result.issues);

/** The accepted value, or `undefined` for a rejection. */
export const valueOf = <T>(result: ValidationResult<T>): T | undefined =>
  result.ok ? result.value : undefined;

/** The accepted value; a rejection fails the test with its first issue. */
export const accepted = <T>(result: ValidationResult<T>): T => {
  if (!result.ok) {
    throw new Error(
      `rejected at ${result.issues[0].instancePath} (${result.issues[0].keyword})`,
    );
  }
  return result.value;
};
