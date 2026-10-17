// The fake Play API's public types: its options, its handle, and what it
// records.

import type { BrowserContext } from "@playwright/test";

import type { Answer } from "./fake-play-wire.ts";
import type { PlayOperationId } from "./play-api-document.ts";
import type { SecretSource } from "./secret-needles.ts";

/** A request as the fake decoded it. The token itself is not kept. */
export type Served = {
  readonly operationId: PlayOperationId | undefined;
  readonly method: string;
  readonly url: string;
  readonly authorized: boolean;
  /** The decoded JSON body, or `undefined` when none was sent. */
  readonly body: unknown;
};

/** A secret the fake handed out or expects, for the secret scan. */
export type FakeSecret = {
  readonly label: string;
  readonly value: string;
};

export type FakePlayApiOptions = {
  /** The Play API base, ending with `/play/v1`, as the configuration gives it. */
  readonly playApiBaseUrl: string;
  /** Seeds the launch code, the session id, and the play tokens. */
  readonly seed: string;
  /** The server's time for every response (`Date`, token deadlines). */
  readonly now: Date;
  /** More secrets to redact from `unexpected`, besides the fake's own. */
  readonly secretSources?: readonly SecretSource[];
};

export type FakePlayApi = {
  readonly playApiBaseUrl: string;
  /** The single-use launch code this session is opened with. Secret. */
  readonly launchCode: string;
  /**
   * The launch URL of `wrapperUrl`: `<wrapper-url>#<code>`, the whole fragment
   * being the launch code, with no parameter name.
   */
  readonly launchUrl: (wrapperUrl: string) => string;
  readonly served: readonly Served[];
  /** Queues the answers to the next calls of operation `id`, in order. */
  readonly answer: <Id extends PlayOperationId>(
    id: Id,
    ...answers: readonly Answer<Id>[]
  ) => void;
  /** The answer to every call of `id` once its queue is empty. */
  readonly answerEvery: <Id extends PlayOperationId>(
    id: Id,
    answer: Answer<Id>,
  ) => void;
  /**
   * While cut, every Play API request fails as a network failure, whatever is
   * queued; the queue is kept for when the connection is restored.
   */
  readonly cut: () => void;
  /**
   * Lets the launch code be redeemed once more, for the same session id with a
   * new token: a tab cloned with its session (T-17). The real API redeems a
   * code once, so a second launch of one code is otherwise refused.
   */
  readonly redeemAgain: () => void;
  readonly restore: () => void;
  /** The launch code and every play token issued so far. */
  readonly secrets: () => readonly FakeSecret[];
  /**
   * Calls the script had no answer for, and requests to an unknown route. A
   * fixture fails the test when any is left (`takeUnexpected` clears them).
   */
  readonly unexpected: () => readonly string[];
  readonly takeUnexpected: () => readonly string[];
  /** Routes the Play API base on `context`. */
  readonly install: (context: BrowserContext) => Promise<void>;
};
