// A fake Play API for the unit tests: an injected `fetch` that answers from a
// script of replies and records every request. It knows no paths or operation
// shapes yet: those come from the Play API document, which is not vendored in
// `contracts` (specs/client-kit/the-contracts-package.md). When it is, the
// fake is built from that document.

import type { FetchLike, RequestInitLike, ResponseLike } from "../platform.ts";

export type RecordedRequest = {
  readonly url: string;
  readonly init: RequestInitLike;
};

export type Reply =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly body?: string;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "network-failure" }
  /** Never answers: the request can only end by its timeout. */
  | { readonly kind: "hang" };

export type FakePlayApi = {
  readonly fetch: FetchLike;
  readonly requests: readonly RecordedRequest[];
  /** Queues the replies to the next requests, in order. */
  readonly reply: (...replies: readonly Reply[]) => void;
};

/** A JSON reply; an error status is sent as `application/problem+json`. */
export const json = (
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Reply => ({
  kind: "response",
  status,
  body: JSON.stringify(body),
  headers: {
    "content-type":
      status >= 400 ? "application/problem+json" : "application/json",
    ...headers,
  },
});

const toResponse = (
  reply: Extract<Reply, { kind: "response" }>,
): ResponseLike => {
  const headers = new Map(
    Object.entries(reply.headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );
  return {
    status: reply.status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(reply.body ?? ""),
  };
};

const never = (): void => {};

export const createFakePlayApi = (): FakePlayApi => {
  const requests: RecordedRequest[] = [];
  const queue: Reply[] = [];
  const fetch: FetchLike = (url, init) => {
    requests.push({ url, init });
    const next = queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error("the fake Play API has no reply queued"));
    }
    if (next.kind === "network-failure") {
      // A platform error that names the URL: the client must not pass it on.
      return Promise.reject(new TypeError(`Failed to fetch ${url}`));
    }
    if (next.kind === "hang") {
      return new Promise<never>(never);
    }
    return Promise.resolve(toResponse(next));
  };
  return {
    fetch,
    requests,
    reply: (...replies) => {
      queue.push(...replies);
    },
  };
};
