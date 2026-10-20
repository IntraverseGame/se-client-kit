// The e2e suite's fake of the verify API (specs/verify-page.md, "The e2e fake of
// the verify API"): a Playwright route at the configured verify API base that
// answers `GET <base>/rounds/{roundId}` as scripted, so no request leaves the
// browser process. A round id with no scripted answer gets the not-found
// answer, like an unknown round.
//
// ASSUMPTION (A-1, TODO(verify API)): the verify API document is not vendored,
// so the answers follow the page's assumed shape (`apps/verify/src/verify-api.ts`):
// 200 with a JSON body, 404 for no such round (no body), any other status an
// error. The fake is on the page's own origin in the suite (as in preview), so
// it sends no CORS headers. A call it does not know (another method, another
// path) is recorded as unexpected, and the fixture fails the test. Nothing here
// logs, and the fake holds no secret.

import type { BrowserContext, Route } from "@playwright/test";

/** What the fake answers for a round id. */
export type VerifyAnswer =
  /** 200 with `body` as JSON (the verify API's read of a round). */
  | { readonly kind: "round"; readonly body: unknown }
  /** 404: no such round. */
  | { readonly kind: "not-found" }
  /** Another non-2xx status (a scripted error), with no body. */
  | { readonly kind: "error"; readonly status: number }
  /** 200 with a body that is not JSON. */
  | { readonly kind: "unreadable" }
  /** The request fails with no answer (the API is unreachable). */
  | { readonly kind: "abort" };

/** One read the fake answered. */
export type VerifyRead = {
  readonly roundId: string;
  readonly answered: VerifyAnswer["kind"];
};

export type FakeVerifyApiOptions = {
  /** `verifyApiBaseUrl`: an absolute URL ending with `/verify/v1`. */
  readonly baseUrl: string;
};

export type FakeVerifyApi = {
  /** Answers every read of `roundId` with `answer`, after any queued ones. */
  readonly answerEvery: (roundId: string, answer: VerifyAnswer) => void;
  /** Queues answers for `roundId`, each used once, before `answerEvery`'s. */
  readonly answer: (roundId: string, ...answers: VerifyAnswer[]) => void;
  /** The reads answered so far, in order. */
  readonly reads: () => readonly VerifyRead[];
  /** The calls the fake does not know, as `METHOD path`. */
  readonly unexpected: () => readonly string[];
  readonly install: (context: BrowserContext) => Promise<void>;
};

const NO_STORE = { "cache-control": "no-store" } as const;

const respond = async (route: Route, answer: VerifyAnswer): Promise<void> => {
  if (answer.kind === "round") {
    await route.fulfill({
      status: 200,
      headers: { ...NO_STORE, "content-type": "application/json" },
      body: JSON.stringify(answer.body),
    });
  } else if (answer.kind === "not-found") {
    await route.fulfill({ status: 404, headers: NO_STORE, body: "" });
  } else if (answer.kind === "error") {
    await route.fulfill({ status: answer.status, headers: NO_STORE, body: "" });
  } else if (answer.kind === "unreadable") {
    await route.fulfill({
      status: 200,
      headers: { ...NO_STORE, "content-type": "application/json" },
      body: "{ not json",
    });
  } else {
    await route.abort("failed");
  }
};

/** The round id of `pathname` under `basePath`, or `undefined` for another path. */
const roundIdOf = (basePath: string, pathname: string): string | undefined => {
  const prefix = `${basePath}/rounds/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  if (rest === "" || rest.includes("/")) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    return undefined;
  }
};

export const createFakeVerifyApi = (
  options: FakeVerifyApiOptions,
): FakeVerifyApi => {
  const base = new URL(options.baseUrl);
  const basePath = base.pathname.replace(/\/+$/u, "");
  const queued = new Map<string, VerifyAnswer[]>();
  const standing = new Map<string, VerifyAnswer>();
  const reads: VerifyRead[] = [];
  const unexpected: string[] = [];

  return {
    answerEvery: (roundId, answer) => {
      standing.set(roundId, answer);
    },
    answer: (roundId, ...answers) => {
      queued.set(roundId, [...(queued.get(roundId) ?? []), ...answers]);
    },
    reads: () => [...reads],
    unexpected: () => [...unexpected],
    install: async context => {
      await context.route(`${base.origin}${basePath}/**`, async route => {
        const request = route.request();
        const { pathname } = new URL(request.url());
        const roundId =
          request.method() === "GET"
            ? roundIdOf(basePath, pathname)
            : undefined;
        if (roundId === undefined) {
          unexpected.push(`${request.method()} ${pathname}`);
          await route.fulfill({ status: 400, headers: NO_STORE, body: "" });
          return;
        }
        const answer: VerifyAnswer = queued.get(roundId)?.shift() ??
          standing.get(roundId) ?? { kind: "not-found" };
        reads.push({ roundId, answered: answer.kind });
        await respond(route, answer);
      });
    },
  };
};
