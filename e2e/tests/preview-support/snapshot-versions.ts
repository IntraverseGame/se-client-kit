// The W-29 check against the real stack (RFC-002, Q10). Until the backend's
// per-session counter lands, a Snapshot's `version` is not monotonic: a later
// read can carry a lower one (the interim limit in W-29). The preview run is the
// one place that can show the counter has landed. This records the `version` of
// every Snapshot response of a session with the time the request began and the
// time its response ended, and finds the decreases among responses that did not
// overlap another Snapshot response in time: with two requests in flight their
// answers may arrive in either order, which is not the backend's counter going
// down. Nothing here is a secret, and nothing is logged.

export type VersionRecord = {
  /** A monotonic time, in milliseconds, when the request began. */
  readonly startedAt: number;
  /** A monotonic time, in milliseconds, when the response ended. */
  readonly endedAt: number;
  readonly version: number;
};

/** A response that began and ended with no other Snapshot response in flight. */
const isAlone = (
  record: VersionRecord,
  all: readonly VersionRecord[],
): boolean =>
  all.every(
    other =>
      other === record ||
      other.endedAt <= record.startedAt ||
      other.startedAt >= record.endedAt,
  );

/**
 * The versions of the records that overlapped no other, in the order the
 * requests began, that were lower than the one before. Empty when the counter
 * never went down.
 */
export const versionDecreases = (
  records: readonly VersionRecord[],
): readonly { readonly from: number; readonly to: number }[] => {
  const alone = records
    .filter(record => isAlone(record, records))
    .toSorted((left, right) => left.startedAt - right.startedAt);
  return alone.flatMap((record, index) => {
    const before = alone[index - 1];
    return before !== undefined && record.version < before.version
      ? [{ from: before.version, to: record.version }]
      : [];
  });
};
