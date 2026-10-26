// The test's own read of the verify API (RFC-002): `GET <verifyApiBaseUrl>/rounds/
// <roundId>`, a request that does not pass through the browser's routes. So it is
// checked on the allow-list before it is sent (naming the origin only), made with
// no credentials and **no redirect** (a redirect could reach an origin the list
// does not hold, and only the first URL is checked), and bounded in time. Every
// failure is a plain error that holds neither the URL nor the network error.

import { DOCUMENT_TIMEOUT_MS } from "./environment-document.ts";
import { assertAllowedUrl } from "./guard-preview.ts";
import {
  type VerificationFacts,
  verificationFacts,
} from "./preview-snapshots.ts";

export type VerifyFetch = (
  url: string,
  init: {
    readonly credentials: "omit";
    readonly redirect: "error";
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly status: number;
  readonly json: () => Promise<unknown>;
}>;

export const readVerification = async (
  options: {
    readonly verifyApiBaseUrl: string;
    readonly allowedOrigins: readonly string[];
    readonly roundId: string;
  },
  fetchImpl: VerifyFetch = fetch,
): Promise<VerificationFacts> => {
  const url = `${options.verifyApiBaseUrl}/rounds/${encodeURIComponent(options.roundId)}`;
  assertAllowedUrl(options.allowedOrigins, url);
  let status = 0;
  let body: unknown;
  try {
    const response = await fetchImpl(url, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
    });
    ({ status } = response);
    body = status === 200 ? await response.json() : undefined;
  } catch {
    // The network error names the URL (a refused redirect, the host): dropped.
    throw new Error("the verify API could not be read");
  }
  if (status !== 200) {
    throw new Error(`the verify API answered ${String(status)}`);
  }
  const facts = verificationFacts(body);
  if (facts === undefined) {
    throw new Error("the verify API answered a body that is not a round");
  }
  return facts;
};
