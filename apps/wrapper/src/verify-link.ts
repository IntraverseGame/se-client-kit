// The link to the verify page after a round ends (W-39): the environment
// configuration's `verifyBaseUrl` with one trailing `/` removed if present,
// then `/rounds/` and the round id (specs/verify-page.md, V-1). The round id is
// the validated Snapshot's `roundId`, canonical UUIDv7 text, so it needs no
// escaping. The round id is also shown beside the link with a control to copy
// it.

/** The verify page URL for a round: `<verifyBaseUrl>/rounds/{roundId}`. */
export const verifyUrlFor = (
  verifyBaseUrl: string,
  roundId: string,
): string => {
  const base = verifyBaseUrl.endsWith("/")
    ? verifyBaseUrl.slice(0, -1)
    : verifyBaseUrl;
  return `${base}/rounds/${roundId}`;
};
