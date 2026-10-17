// The in-repo fake Play API of the e2e suite. It is a Playwright route on the
// test's browser context, so no server, port, or socket is involved: a request
// to the Play API base never leaves the browser process.
//
// It answers from the vendored contract only:
// - routes, listed statuses, and request bodies come from the Play API document
//   (play-api-document.ts, held to the generated types);
// - every Snapshot and every scripted problem is a `valid/` Snapshot vector
//   (vectors.ts), checked to be of the definition the answer needs, and a
//   problem is sent with its own `status`, which must be one the operation
//   lists;
// - the bodies the fake writes itself (the redeem and refresh responses, and
//   the problems of a missing token or a malformed body) are typed by the
//   document's response types.
//
// It holds the session's secrets (the launch code and every play token it
// issues) so the secret scan can look for them; they are deterministic, derived
// from a seed with SHA-256, so a run is reproducible. Nothing here logs.

import type { Route } from "@playwright/test";

import { responder } from "./fake-play-responses.ts";
import type {
  FakePlayApi,
  FakePlayApiOptions,
  FakeSecret,
  Served,
} from "./fake-play-types.ts";
import {
  bearerOf,
  checkAnswer,
  decodeBody,
  hex32,
  opaque,
  ownProblem,
  routeOf,
  type Answer,
  type ProblemBody,
} from "./fake-play-wire.ts";
import { GAME_ORIGIN } from "./origins.ts";
import {
  isAcceptedBody,
  isListedStatus,
  type PlayOperationId,
  type PlaySuccessBody,
} from "./play-api-document.ts";
import { redactSecrets } from "./secret-needles.ts";
import { validVector } from "./vectors.ts";

const API_SUFFIX = "/play/v1";

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

const never = (): void => {};

export const createFakePlayApi = (options: FakePlayApiOptions): FakePlayApi => {
  const { playApiBaseUrl, seed, now, secretSources = [] } = options;
  if (!playApiBaseUrl.endsWith(API_SUFFIX)) {
    throw new Error("playApiBaseUrl must end with /play/v1");
  }
  // The document's paths start with `/play/v1`; the base may sit below a prefix.
  const prefix = new URL(playApiBaseUrl).pathname.slice(0, -API_SUFFIX.length);
  const launchCode = opaque("lc_", seed, "launch-code");
  const sessionId = `ses_${hex32(seed, "session")}`;
  const issued: string[] = [];
  const valid = new Set<string>();
  // The real API redeems a code once; `redeemAgain` adds one for T-17.
  let redeemsLeft = 1;
  let isCut = false;
  const served: Served[] = [];
  const unexpected: string[] = [];
  const queues = new Map<PlayOperationId, Answer[]>();
  const fallbacks = new Map<PlayOperationId, Answer>();

  const issueToken = (): string => {
    const token = opaque("pt_", seed, `play-token-${issued.length}`);
    issued.push(token);
    valid.add(token);
    return token;
  };

  const deadline = (offsetMs: number): string =>
    new Date(now.getTime() + offsetMs).toISOString();

  const { json, problem } = responder(now);

  /**
   * A problem the fake writes itself, only with a status the document lists for
   * the operation; otherwise the call fails the test as an unscripted one.
   */
  const own = async (
    route: Route,
    id: PlayOperationId,
    body: ProblemBody,
    why: string,
  ): Promise<void> => {
    if (isListedStatus(id, body.status)) {
      await problem(route, body);
      return;
    }
    unexpected.push(`${id}: ${why}`);
    await problem(route, ownProblem("INTERNAL", 500));
  };

  const play = async (route: Route, answer: Answer): Promise<void> => {
    switch (answer.kind) {
      case "snapshot": {
        await json(route, 200, validVector(answer.vector, "Snapshot").input);
        return;
      }
      case "problem": {
        await problem(route, validVector(answer.vector, "PlayProblem").input);
        return;
      }
      case "network-failure": {
        await route.abort("internetdisconnected");
        return;
      }
      default: {
        // `hang`: the route is left unanswered.
        await new Promise<never>(never);
      }
    }
  };

  const nextAnswer = (id: PlayOperationId): Answer | undefined =>
    queues.get(id)?.shift() ?? fallbacks.get(id);

  const redeem = async (route: Route, body: unknown): Promise<void> => {
    const code = (body as { readonly launchCode: unknown }).launchCode;
    if (redeemsLeft === 0 || code !== launchCode) {
      await own(
        route,
        "redeemLaunchCode",
        ownProblem("UNAUTHENTICATED", 401),
        "launch code refused",
      );
      return;
    }
    redeemsLeft -= 1;
    const response: PlaySuccessBody<"redeemLaunchCode"> = {
      sessionId,
      playToken: issueToken(),
      tokenExpiresAt: deadline(TOKEN_LIFETIME_MS),
      sessionExpiresAt: deadline(SESSION_LIFETIME_MS),
      gameOrigin: GAME_ORIGIN,
    };
    await json(route, 200, response);
  };

  const refresh = async (route: Route, presented: string): Promise<void> => {
    // Every token older than the presented one is revoked; it keeps its own.
    for (const token of issued.slice(0, issued.indexOf(presented))) {
      valid.delete(token);
    }
    const response: PlaySuccessBody<"refreshPlayToken"> = {
      playToken: issueToken(),
      tokenExpiresAt: deadline(TOKEN_LIFETIME_MS),
    };
    await json(route, 200, response);
  };

  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toLowerCase();
    const operationId = url.pathname.startsWith(prefix)
      ? routeOf(url.pathname.slice(prefix.length), method)
      : undefined;
    const token = bearerOf(
      (await request.headerValue("authorization")) ?? undefined,
    );
    const body = decodeBody(request.postData());
    served.push({
      operationId,
      method,
      url: `${url.origin}${url.pathname}`,
      authorized: token !== undefined && valid.has(token),
      body,
    });
    if (isCut) {
      await route.abort("internetdisconnected");
      return;
    }
    if (operationId === undefined) {
      unexpected.push(`${method.toUpperCase()} ${url.pathname}: no such route`);
      await problem(route, ownProblem("NOT_FOUND", 404));
      return;
    }
    // Every operation but the redeem requires the play token (`security`).
    if (
      operationId !== "redeemLaunchCode" &&
      (token === undefined || !valid.has(token))
    ) {
      await own(
        route,
        operationId,
        ownProblem("UNAUTHENTICATED", 401),
        "no valid play token",
      );
      return;
    }
    if (!isAcceptedBody(operationId, body)) {
      await own(
        route,
        operationId,
        ownProblem("INVALID_ARGUMENT", 400),
        "a body the document does not accept, and it lists no 400",
      );
      return;
    }
    const answer = nextAnswer(operationId);
    if (answer !== undefined) {
      await play(route, answer);
      return;
    }
    if (operationId === "redeemLaunchCode") {
      await redeem(route, body);
      return;
    }
    if (operationId === "refreshPlayToken" && token !== undefined) {
      await refresh(route, token);
      return;
    }
    unexpected.push(`${operationId}: no answer scripted`);
    await own(route, operationId, ownProblem("INTERNAL", 500), "no answer");
  };

  const ownSecrets = (): readonly FakeSecret[] => [
    { label: "launch code", value: launchCode },
    ...issued.map((value, index) => ({ label: `play token ${index}`, value })),
  ];
  const redactAll = (entries: readonly string[]): readonly string[] =>
    entries.map(entry => redactSecrets(entry, [ownSecrets, ...secretSources]));

  const queue = (id: PlayOperationId, answers: readonly Answer[]): void => {
    for (const answer of answers) checkAnswer(id, answer);
    queues.set(id, [...(queues.get(id) ?? []), ...answers]);
  };

  return {
    playApiBaseUrl,
    launchCode,
    launchUrl: wrapperUrl => `${wrapperUrl.split("#")[0] ?? ""}#${launchCode}`,
    served,
    answer: (id, ...answers) => {
      queue(id, answers as readonly Answer[]);
    },
    answerEvery: (id, answer) => {
      checkAnswer(id, answer as Answer);
      fallbacks.set(id, answer as Answer);
    },
    cut: () => {
      isCut = true;
    },
    redeemAgain: () => {
      redeemsLeft += 1;
    },
    restore: () => {
      isCut = false;
    },
    secrets: ownSecrets,
    unexpected: () => redactAll(unexpected),
    takeUnexpected: () => redactAll(unexpected.splice(0)),
    install: async context => {
      await context.route(`${playApiBaseUrl}/**`, handle);
    },
  };
};
