// The shell's interim rule for a book round's statuses (book-playback.md W-54;
// issue #146): a book round shows exactly `idle`, `starting`, `won`, and
// `lost`, so a `playback` Snapshot whose `status` is `active`, `resolving`, or
// `canceled` fails validation (W-28), with the issue at `/status`. The vendored
// Snapshot schema still allows the three on a book round, and the `snapshot`
// validator follows the vendored schema exactly, so the shell applies the rule
// itself, after the validator, on every Snapshot it validates (a read, an
// action's answer, and a typed error's embedded Snapshot).
// The spec's marker (book-playback.md W-54, #146) names the sync that ends it:
// once the re-vendored schema refuses the three statuses, the validator does,
// and this module is removed.

import {
  type ValidationIssue,
  type ValidationResult,
  type ValidPlayProblem,
  type ValidSnapshot,
  validatePlayProblem,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";

/** The statuses a book round shows (W-54). */
const BOOK_STATUSES: ReadonlySet<string> = new Set([
  "idle",
  "starting",
  "won",
  "lost",
]);

/**
 * The issue a refused book status reports: at `/status`, as the schema's own
 * rule will once it is vendored. It names locations only, never a value.
 */
export const BOOK_STATUS_ISSUE: ValidationIssue = Object.freeze({
  instancePath: "/status",
  schemaPath: "/properties/status",
  keyword: "book-status",
});

/** Whether a validated Snapshot is a book round in a status it never shows. */
const refusedBookStatus = (snapshot: ValidSnapshot): boolean =>
  snapshot.presentation === "playback" && !BOOK_STATUSES.has(snapshot.status);

/**
 * `validateSnapshot`, then the book-status rule: the one way the shell
 * validates a Snapshot. Never throws.
 */
export const validateSessionSnapshot = (
  input: unknown,
): ValidationResult<ValidSnapshot> => {
  const result = validateSnapshot(input);
  if (!result.ok || !refusedBookStatus(result.value)) return result;
  return { ok: false, issues: [BOOK_STATUS_ISSUE] };
};

/**
 * `validatePlayProblem`, then the book-status rule on its embedded Snapshot
 * (`ROUND_ACTIVE`), at `/snapshot/status`. Never throws.
 */
export const validateSessionProblem = (
  input: unknown,
): ValidationResult<ValidPlayProblem> => {
  const result = validatePlayProblem(input);
  const embedded = result.ok ? result.value.snapshot : undefined;
  if (embedded === undefined || !refusedBookStatus(embedded)) return result;
  return {
    ok: false,
    issues: [
      Object.freeze({
        ...BOOK_STATUS_ISSUE,
        instancePath: `/snapshot${BOOK_STATUS_ISSUE.instancePath}`,
      }),
    ],
  };
};
