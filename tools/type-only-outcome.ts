// The run-time half of the release consumer check for type-only `exports`
// entries (tools/release-consumer.ts): the consumer script prints one outcome
// line per entry, and these pure functions judge them, so each guard is
// unit-tested (tools/type-only-outcome.test.ts).

/** What a run-time import of a type-only entry did. */
export type ImportOutcome =
  | { resolved: true }
  | { resolved: false; code: string | undefined };

/**
 * The problem with a type-only entry's run-time import, if any: only a failure
 * with `ERR_PACKAGE_PATH_NOT_EXPORTED` proves that no runtime entry leaked.
 */
export const importOutcomeProblem = (
  specifier: string,
  outcome: ImportOutcome,
): string | undefined => {
  if (outcome.resolved) {
    return `${specifier}: the type-only entry resolved at run time`;
  }
  return outcome.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
    ? undefined
    : `${specifier}: importing the type-only entry failed with ${outcome.code ?? "no error code"}, not ERR_PACKAGE_PATH_NOT_EXPORTED`;
};

/** The prefix of each outcome line the consumer script prints. */
export const OUTCOME_PREFIX = "type-only-outcome ";

const parseOutcome = (
  json: string,
): { specifier: string; outcome: ImportOutcome } | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { specifier, resolved, code } = value as Record<string, unknown>;
  if (typeof specifier !== "string") return undefined;
  if (resolved === true) return { specifier, outcome: { resolved: true } };
  if (resolved === false && (code === null || typeof code === "string")) {
    return {
      specifier,
      outcome: { resolved: false, code: code ?? undefined },
    };
  }
  return undefined;
};

/**
 * The problems in the consumer script's output for the type-only entries: one
 * outcome line (`OUTCOME_PREFIX` and a JSON object) is expected per entry, and
 * each is judged by `importOutcomeProblem`. A missing, repeated, unknown, or
 * unreadable outcome line is a problem, never a pass.
 */
export const typeOnlyOutcomeProblems = (
  specifiers: readonly string[],
  output: string,
): string[] => {
  const problems: string[] = [];
  const outcomes = new Map<string, ImportOutcome>();
  for (const line of output.split("\n")) {
    if (!line.startsWith(OUTCOME_PREFIX)) continue;
    const parsed = parseOutcome(line.slice(OUTCOME_PREFIX.length));
    if (parsed === undefined) {
      problems.push(`an unreadable type-only outcome line: ${line}`);
    } else if (!specifiers.includes(parsed.specifier)) {
      problems.push(`an outcome for an unknown type-only entry: ${line}`);
    } else if (outcomes.has(parsed.specifier)) {
      problems.push(`a repeated outcome for ${parsed.specifier}: ${line}`);
    } else {
      outcomes.set(parsed.specifier, parsed.outcome);
    }
  }
  for (const specifier of specifiers) {
    const outcome = outcomes.get(specifier);
    const problem =
      outcome === undefined
        ? `${specifier}: no outcome for the type-only entry's run-time import`
        : importOutcomeProblem(specifier, outcome);
    if (problem !== undefined) problems.push(problem);
  }
  return problems;
};
