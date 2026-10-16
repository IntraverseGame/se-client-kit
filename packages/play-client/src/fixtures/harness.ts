import type { AbortControllerLike } from "../platform.ts";
import {
  bearerAuthorization,
  createTransport,
  type PlayRequest,
  type Transport,
} from "../transport.ts";
import { createFakeClock, type FakeClock } from "./fake-clock.ts";
import {
  createFakePlayApi,
  type FakePlayApi,
  type RecordedRequest,
} from "./fake-play-api.ts";
import { BASE_URL, FIXTURE_TOKEN, START_MS } from "./session.ts";

export type Outcome<T> = { readonly value?: T; readonly error?: unknown };

export type Harness = {
  readonly api: FakePlayApi;
  readonly clock: FakeClock;
  readonly transport: Transport;
  /** How many requests were aborted. */
  readonly aborts: () => number;
  /** The recorded request at `index`; throws when there is none. */
  readonly request: (index: number) => RecordedRequest;
  /** Settles `promise` while advancing the fake clock by `advanceMs`. */
  readonly settle: <T>(
    promise: Promise<T>,
    advanceMs?: number,
  ) => Promise<Outcome<T>>;
};

/** A transport over a fake Play API and a fake clock. */
export const createHarness = (): Harness => {
  const api = createFakePlayApi();
  const clock = createFakeClock(START_MS);
  let aborts = 0;
  const abortController = (): AbortControllerLike => {
    const signal = { aborted: false };
    return {
      signal,
      abort: () => {
        aborts += 1;
        signal.aborted = true;
      },
    };
  };
  const transport = createTransport({
    baseUrl: BASE_URL,
    fetch: api.fetch,
    clock,
    createAbortController: abortController,
  });
  return {
    api,
    clock,
    transport,
    aborts: () => aborts,
    request: index => {
      const found = api.requests[index];
      if (found === undefined) {
        throw new Error(`no request ${String(index)}`);
      }
      return found;
    },
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

/** Adds the fixture token as the request's authorization. */
export const authorized = (request: PlayRequest): PlayRequest => ({
  ...request,
  authorization: () => bearerAuthorization(FIXTURE_TOKEN),
});

/** Every way an error can be shown: none of them may hold the token. */
export const shownForms = (error: unknown): readonly string[] => {
  if (!(error instanceof Error)) {
    throw new TypeError("not an error");
  }
  return [
    String(error),
    JSON.stringify(error),
    error.message,
    error.stack ?? "",
  ];
};

/** The `status` of a problem body. */
export const statusOf = (body: { readonly status: number }): number =>
  body.status;
