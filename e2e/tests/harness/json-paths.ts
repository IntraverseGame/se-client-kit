// The dotted paths at which two JSON values differ, for the tests that hold a
// tampered canned round to one changed field (fake-verify-api.spec.ts,
// fake-verify-book-rounds.spec.ts).

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The dotted paths whose leaf values differ between two JSON values. */
export const changedPaths = (
  before: unknown,
  after: unknown,
  path = "",
): readonly string[] => {
  if (isObject(before) && isObject(after)) {
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap(key =>
      changedPaths(
        before[key],
        after[key],
        path === "" ? key : `${path}.${key}`,
      ),
    );
  }
  return Object.is(before, after) ? [] : [path];
};
