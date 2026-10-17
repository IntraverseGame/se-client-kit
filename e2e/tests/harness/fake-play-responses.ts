// How the fake Play API writes a response: JSON or problem+json, always
// `Cache-Control: no-store`, and `Date` from the fake's fixed server time.

import type { Route } from "@playwright/test";

import type { ProblemBody } from "./fake-play-wire.ts";

export type Responder = {
  readonly json: (route: Route, status: number, body: unknown) => Promise<void>;
  /** A problem, sent with the status its body carries. */
  readonly problem: (
    route: Route,
    body: ProblemBody | Readonly<Record<string, unknown>>,
  ) => Promise<void>;
};

export const responder = (now: Date): Responder => {
  const headers = (contentType: string): Record<string, string> => ({
    "content-type": contentType,
    "cache-control": "no-store",
    date: now.toUTCString(),
  });
  return {
    json: (route, status, body) =>
      route.fulfill({
        status,
        headers: headers("application/json"),
        body: JSON.stringify(body),
      }),
    problem: (route, body) =>
      route.fulfill({
        status: Number(body["status"]),
        headers: headers("application/problem+json"),
        body: JSON.stringify(body),
      }),
  };
};
