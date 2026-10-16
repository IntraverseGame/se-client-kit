// Fixture values for the tests. The deadlines are the kind of value a redeem
// or refresh response carries; tests read them from here, never from numbers
// written in the test (specs/wrapper.md, "Session open and the play token").

/** The local clock at the start of every test. */
export const START_MS: number = Date.parse("2026-10-16T12:00:00.000Z");

/** A placeholder play token: not a real credential, only a marker to search for. */
export const FIXTURE_TOKEN = "fixture-play-token-6f1c2a";

export const BASE_URL = "https://se.example.test/play/v1";

/** A token whose deadline is 15 minutes after `START_MS`, server clock. */
export const longToken = {
  tokenExpiresAt: "2026-10-16T12:15:00.000Z",
} as const;

/** A token whose deadline is 2 minutes after `START_MS`, server clock. */
export const shortToken = {
  tokenExpiresAt: "2026-10-16T12:02:00.000Z",
} as const;

/** A `Date` header 90 seconds ahead of `START_MS`. */
export const SERVER_AHEAD_DATE = "Fri, 16 Oct 2026 12:01:30 GMT";
