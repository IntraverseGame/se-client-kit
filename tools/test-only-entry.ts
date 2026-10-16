// The `contracts` test-only entry (the vectors) may be imported by test files
// and test helpers only (ADR-001; specs/client-kit.md, "The contracts package").
// The lint rule in .oxlintrc.json is the first check; this is the independent
// one the `contracts` CI job runs over the same tree.

const TEST_ONLY_ENTRY =
  /["'`]@intraverse\/se-client-contracts\/testing(?:\/[^"'`]*)?["'`]/u;
const TEST_ONLY_SOURCE =
  /["'`](?:\.\.?\/)+(?:[^"'`]*\/)?contracts\/(?:src\/)?testing(?:\.[a-z]+)?["'`]/u;

/** Test files, test helpers, and the e2e suite (which is all test code). */
export const isTestPath = (path: string): boolean => {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path) ||
    /(?:^|\/)(?:test|tests|__tests__|fixtures)\//u.test(path) ||
    path.startsWith("e2e/")
  );
};

/** Whether the module `path` is itself the test-only entry of `contracts`. */
const isTestOnlyEntryModule = (path: string): boolean => {
  return /^packages\/contracts\/src\/testing(?:\/|\.[cm]?[jt]s$)/u.test(path);
};

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

export const isSourcePath = (path: string): boolean => {
  return SOURCE_FILE.test(path);
};

/** Paths of non-test source files that reference the test-only entry. */
export const findIllegalImports = (
  files: ReadonlyMap<string, string>,
): string[] => {
  const offenders: string[] = [];
  for (const [path, text] of files) {
    if (!isSourcePath(path) || isTestPath(path) || isTestOnlyEntryModule(path))
      continue;
    if (TEST_ONLY_ENTRY.test(text) || TEST_ONLY_SOURCE.test(text))
      offenders.push(path);
  }
  return offenders.toSorted();
};
