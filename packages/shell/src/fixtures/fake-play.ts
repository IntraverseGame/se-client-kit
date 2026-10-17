// Test-only: a scripted Play API transport. Each operation answers from its own
// queue of responders, in order; an operation with an empty queue fails the
// test. Every request is recorded, so a test can check what was sent and how
// often. No network, no clock: the answers are synchronous values.

import {
  NetworkError,
  PLAY_ROUTES,
  type PlayOperationId,
  type PlayRequest,
  type PlayResponse,
  ProblemError,
  type Transport,
} from "@intraverse/se-client-play-client";

/** One scripted answer: a response, or a thrown client error. */
export type Responder = (
  request: PlayRequest,
) => PlayResponse | Promise<PlayResponse>;

export type FakePlay = {
  readonly transport: Transport;
  /** Queues answers for `id`, used once each, in order. */
  readonly answer: (id: PlayOperationId, ...responders: Responder[]) => void;
  /** The requests sent to `id`, in order. */
  readonly sent: (id: PlayOperationId) => readonly PlayRequest[];
  /** Every request, in order. */
  readonly all: () => readonly PlayRequest[];
};

const idOf = (request: PlayRequest): PlayOperationId => {
  const entry = Object.entries(PLAY_ROUTES).find(
    ([, route]) =>
      route.path === request.path && route.method === request.method,
  );
  if (entry === undefined) throw new Error(`fake play: ${request.path}`);
  return entry[0] as PlayOperationId;
};

export const createFakePlay = (): FakePlay => {
  const queues = new Map<PlayOperationId, Responder[]>();
  const requests: PlayRequest[] = [];
  const transport: Transport = {
    send: async (request: PlayRequest): Promise<PlayResponse> => {
      requests.push(request);
      const id = idOf(request);
      const next = queues.get(id)?.shift();
      if (next === undefined) throw new Error(`fake play: no answer for ${id}`);
      return await next(request);
    },
  };
  return {
    transport,
    answer: (id, ...responders) => {
      queues.set(id, [...(queues.get(id) ?? []), ...responders]);
    },
    sent: id => requests.filter(request => idOf(request) === id),
    all: () => requests,
  };
};

/** Answers `body` with 200. */
export const ok =
  (body: unknown): Responder =>
  () => ({ status: 200, body, receivedAtMs: 0, clockOffsetMs: undefined });

/** Fails with a problem of `code`, as the transport reports one. */
export const problem =
  (status: number, code: string, retryable = false): Responder =>
  request => {
    throw new ProblemError(
      request,
      { status, code, retryable },
      { status, code, retryable, title: code, type: "about:blank" },
    );
  };

/** Fails with no response (W-43). */
export const lost: Responder = request => {
  throw new NetworkError(request, "network");
};

/** An answer the test releases later, to hold a call in flight. */
export const deferred = (): {
  readonly responder: Responder;
  readonly release: (response: Responder) => void;
} => {
  let resolve: ((responder: Responder) => void) | undefined;
  const gate = new Promise<Responder>(done => {
    resolve = done;
  });
  return {
    responder: async request => (await gate)(request),
    release: response => resolve?.(response),
  };
};
