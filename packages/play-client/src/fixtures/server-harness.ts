// A transport over the fake Play API server and a manual clock, with the
// operations' calls ready to make: the play token comes from the fixture.

import type { AuthorizedCallOptions, Seal } from "../operations.ts";
import {
  bearerAuthorization,
  createTransport,
  type Transport,
} from "../transport.ts";
import { createCancel, type FakeCancel } from "./cancel.ts";
import { createFakeClock, type FakeClock } from "./fake-clock.ts";
import {
  createFakePlayServer,
  type FakePlayServer,
} from "./fake-play-server.ts";
import type { Outcome } from "./harness.ts";
import { BASE_URL, FIXTURE_TOKEN, START_MS } from "./session.ts";

/** What the test seal returns: it holds no token, as the shell's would not. */
export type TestSealed = { readonly sealed: true };

/** The value every test seal returns. */
export const SEALED: TestSealed = Object.freeze({ sealed: true });

export type ServerHarness = {
  /** A seal that records the tokens it was given, for the test to check. */
  readonly seal: Seal<TestSealed>;
  /** The tokens the seal was given, in order. */
  readonly sealedTokens: () => readonly string[];
  readonly server: FakePlayServer;
  readonly clock: FakeClock;
  readonly transport: Transport;
  /** The caller's cancel signal the case table's calls carry. */
  readonly cancel: FakeCancel;
  /** The fixture token as the call's credential. */
  readonly auth: AuthorizedCallOptions;
  /** Settles `promise` while advancing the fake clock by `advanceMs`. */
  readonly settle: <T>(
    promise: Promise<T>,
    advanceMs?: number,
  ) => Promise<Outcome<T>>;
};

export const createServerHarness = (): ServerHarness => {
  const server = createFakePlayServer();
  const clock = createFakeClock(START_MS);
  const transport = createTransport({
    baseUrl: BASE_URL,
    fetch: server.fetch,
    clock,
    createAbortController: () => {
      const signal = { aborted: false };
      return {
        signal,
        abort: () => {
          signal.aborted = true;
        },
      };
    },
  });
  const tokens: string[] = [];
  return {
    seal: token => {
      tokens.push(token);
      return SEALED;
    },
    sealedTokens: () => tokens,
    cancel: createCancel(),
    server,
    clock,
    transport,
    auth: { authorization: () => bearerAuthorization(FIXTURE_TOKEN) },
    settle: async <T>(
      promise: Promise<T>,
      advanceMs = 0,
    ): Promise<Outcome<T>> => {
      const outcome = promise.then(
        (value): Outcome<T> => ({ value }),
        (error: unknown): Outcome<T> => ({ error }),
      );
      await clock.advance(advanceMs);
      return outcome;
    },
  };
};
