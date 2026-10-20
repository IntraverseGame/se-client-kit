// The verify API port: the ONLY module that fetches or parses the verify API's
// response (specs/verify-page.md, V-9 to V-11, VT-3). The page reads a round
// through `VerifyApi.readRound` and never sees a response, a status, or a raw
// body; everything past this file works on the `RoundEvidence` type.
//
// The body is `RoundVerification` of the vendored verify API document
// (`GET <verifyApiBaseUrl>/rounds/{roundId}`, `contracts`:
// `src/schemas/verify.v1.openapi.yaml`, whose generated types are
// `VerifyApiComponents`); `verify-body.ts` validates it and maps it to the
// evidence the page's checks take: a body that does not validate is an API
// error (V-10). 404 is "no such round" (`NOT_FOUND`, V-9); any other status is
// an error (V-10), its `Problem` body unread; no answer is unreachable (V-11).
//
// The request itself is `play-client`'s `getRoundVerification` (A-1): one
// attempt, no credential, the 15 s timeout (W-43), the typed errors; the body
// it returns is `unknown` and is validated here.

import {
  createTransport,
  getRoundVerification,
  NetworkError,
  ProblemError,
  ProtocolError,
  type FetchLike,
} from "@intraverse/se-client-play-client";

import type { ChainReadClock } from "./chain-read.ts";
import type { RoundEvidence } from "./round-evidence.ts";
import { parseEvidence } from "./verify-body.ts";

export type VerifyApiResult =
  | { readonly kind: "found"; readonly evidence: RoundEvidence }
  /** The API answered that it has no such round (V-9). */
  | { readonly kind: "not-found" }
  /** Another error status, or a body that does not validate (V-10). */
  | { readonly kind: "error" }
  /** No answer: offline, DNS, TLS, timeout, reset, a blocked request (V-11). */
  | { readonly kind: "unreachable" };

/** The port the page reads a round through. Never throws. */
export type VerifyApi = {
  readonly readRound: (roundId: string) => Promise<VerifyApiResult>;
};

export type VerifyApiOptions = {
  readonly fetch: typeof fetch;
  readonly clock: ChainReadClock;
  /** `verifyApiBaseUrl`, ending with `/verify/v1`. */
  readonly baseUrl: string;
};

/** W-43's request timeout (V-5). */
export const VERIFY_API_TIMEOUT_MS = 15_000;

/** One attempt only: the player's "try again" (V-10, V-11) is the retry. */
const ONE_ATTEMPT = { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0 };

/** A verify API read over an injected `fetch` and clock. */
export const createVerifyApi = (options: VerifyApiOptions): VerifyApi => {
  const { fetch: request } = options;
  // Called unbound: a `fetch` taken off `window` must not get another `this`.
  const send: FetchLike = (url, init) =>
    request(url, init as unknown as RequestInit);
  const transport = createTransport({
    baseUrl: options.baseUrl,
    fetch: send,
    clock: {
      now: () => Date.now(),
      setTimeout: options.clock.setTimeout,
      clearTimeout: options.clock.clearTimeout,
    },
    timeoutMs: VERIFY_API_TIMEOUT_MS,
    retry: ONE_ATTEMPT,
  });
  return {
    readRound: async roundId => {
      try {
        const { body } = await getRoundVerification(transport, roundId);
        const evidence = parseEvidence(body);
        return evidence === undefined
          ? { kind: "error" }
          : { kind: "found", evidence };
      } catch (error) {
        if (error instanceof NetworkError) return { kind: "unreachable" };
        const status =
          error instanceof ProblemError
            ? error.problem.status
            : error instanceof ProtocolError
              ? error.status
              : undefined;
        return status === 404 ? { kind: "not-found" } : { kind: "error" };
      }
    },
  };
};
