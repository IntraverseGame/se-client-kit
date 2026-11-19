// The fake Play API's server time and the lifetime of the play tokens it
// issues: fixed from the start, moved only by a test (T-36), never by a clock.

import type { FakePlayApi } from "./fake-play-types.ts";

/** The lifetime of the play tokens the fake issues until a test sets another. */
export const FAKE_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

export type FakeServerTime = {
  /** The server's time now: the `Date` header of every answer. */
  readonly now: () => Date;
  /** The `tokenExpiresAt` of a play token issued now. */
  readonly tokenExpiresAt: () => string;
  /** The `sessionExpiresAt` of a session opened now. */
  readonly sessionExpiresAt: () => string;
  /** How a test moves them, as the fake's own methods. */
  readonly controls: Pick<
    FakePlayApi,
    "advanceServerTime" | "setTokenLifetime"
  >;
};

export const createServerTime = (start: Date): FakeServerTime => {
  let serverMs = start.getTime();
  let tokenLifetimeMs = FAKE_TOKEN_LIFETIME_MS;
  const after = (ms: number): string => new Date(serverMs + ms).toISOString();
  return {
    now: () => new Date(serverMs),
    tokenExpiresAt: () => after(tokenLifetimeMs),
    sessionExpiresAt: () => after(SESSION_LIFETIME_MS),
    controls: {
      advanceServerTime: ms => {
        if (!(Number.isSafeInteger(ms) && ms >= 0)) {
          throw new RangeError("the server's time moves on by 0 ms or more");
        }
        serverMs += ms;
      },
      setTokenLifetime: ms => {
        if (!(Number.isSafeInteger(ms) && ms > 0)) {
          throw new RangeError("a token lifetime is a positive number of ms");
        }
        tokenLifetimeMs = ms;
      },
    },
  };
};
