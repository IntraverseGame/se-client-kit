import {
  type AmountRequest,
  snapshotSchema,
} from "@intraverse/se-client-contracts";

import {
  createEvaluator,
  type Evaluator,
  type ValidationIssue,
} from "./evaluator/index.ts";
import type { ValidPlayProblem, ValidSnapshot } from "./narrowing.ts";

/**
 * The outcome of a validation: the value, typed, or the failed keywords in
 * evaluation order (`issues[0]` is the first failure). An issue holds locations
 * only, never a value from the document.
 */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
    };

let evaluator: Evaluator | undefined;

/** Created on first use, so importing the package does no work. */
const schemaEvaluator = (): Evaluator => {
  evaluator ??= createEvaluator(snapshotSchema);
  return evaluator;
};

const validateAgainst = <T>(
  ref: string,
  input: unknown,
): ValidationResult<T> => {
  const [first, ...rest] = schemaEvaluator()(ref, input);
  if (first === undefined) {
    // The schema accepted the value, which is what the type states.
    return { ok: true, value: input as T };
  }
  return { ok: false, issues: [first, ...rest] };
};

/** Validates an untrusted value as a `se.snapshot/1` Snapshot. Never throws. */
export const validateSnapshot = (
  input: unknown,
): ValidationResult<ValidSnapshot> => validateAgainst("#", input);

/** Validates an untrusted value as a typed Play API error. Never throws. */
export const validatePlayProblem = (
  input: unknown,
): ValidationResult<ValidPlayProblem> =>
  validateAgainst("#/$defs/PlayProblem", input);

/** Validates a value as a request-side amount. Never throws. */
export const validateAmountRequest = (
  input: unknown,
): ValidationResult<AmountRequest> =>
  validateAgainst("#/$defs/AmountRequest", input);
