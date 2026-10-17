// The link to the verify page after a round ends (W-39). The base comes from
// the environment configuration (`verifyBaseUrl`).
//
// PLACEHOLDER: the verify page's URL shape, and whether it takes the round id
// in the path or in a fragment, is still open (TODO(verify API) in
// specs/wrapper/the-game-iframe-and-the-controller-boundary.md). Until it is
// decided the link opens the configured verify page itself and carries no
// round id; the round id is shown beside it with a control to copy it. This
// function is the one place that changes when the shape is decided.

/** The verify page URL for a round. */
export const verifyUrlFor = (verifyBaseUrl: string, _roundId: string): string =>
  verifyBaseUrl;
