// The wire side of the fake Play API: the scripted answers it accepts, checked
// against the vendored document and vectors before they are queued; the
// problems it writes itself; how it reads a request (route, token, body); and
// the deterministic secrets it derives from its seed.

import { createHash } from "node:crypto";

import {
  type ErrorCode,
  type PlayProblem,
  snapshotSchema,
} from "@intraverse/se-client-contracts";

import {
  PLAY_OPERATIONS,
  PLAY_ROUTES,
  isListedStatus,
  type PlayOperationId,
  type SnapshotOperationId,
} from "./play-api-document.ts";
import { invalidVector, validVector } from "./vectors.ts";

/**
 * A check of the request body an answer is for: the reason it is refused, or
 * `undefined` when it is the one expected.
 */
export type BodyCheck = (body: unknown) => string | undefined;

/** One scripted answer of an operation. */
export type Answer<Id extends PlayOperationId = PlayOperationId> =
  AnswerKind<Id> & {
    /**
     * Checks the body first: a body it refuses is recorded as unexpected (the
     * fixture fails the test) and answered 400, never with this answer.
     */
    readonly expect?: BodyCheck;
  };

type AnswerKind<Id extends PlayOperationId> =
  | (Id extends SnapshotOperationId
      ? {
          /**
           * 200 with the `invalid/` Snapshot vector of this name: a body the
           * schema refuses, for W-28's rejected Snapshot only.
           */
          readonly kind: "invalid-snapshot";
          readonly vector: string;
        }
      : never)
  | {
      /**
       * A problem the fake writes itself, for a code no vector holds; its
       * status must be one the operation lists.
       */
      readonly kind: "own-problem";
      readonly code: ErrorCode;
      readonly status: number;
    }
  | (Id extends SnapshotOperationId
      ? {
          /** 200 with the `valid/` Snapshot vector of this name. */
          readonly kind: "snapshot";
          readonly vector: string;
        }
      : never)
  | (Id extends SnapshotOperationId
      ? {
          /**
           * 200 with the `valid/` Snapshot vector of this name, its `version`
           * replaced by `version` and nothing else changed: a later read that
           * carries a lower `version` than the one last shown (W-29). The value
           * is checked against the vendored schema's `version` before the
           * answer is queued, so the body stays one the schema accepts.
           */
          readonly kind: "snapshot-version";
          readonly vector: string;
          readonly version: number;
        }
      : never)
  | {
      /** The `valid/` PlayProblem vector of this name, with its own status. */
      readonly kind: "problem";
      readonly vector: string;
    }
  /** The connection fails, as when the network is cut. */
  | { readonly kind: "network-failure" }
  /** Never answers: the call can end only by the client's timeout or abort. */
  | { readonly kind: "hang" };

/** `prefix` + 43 base64url characters, the document's token shape. */
export const opaque = (prefix: string, seed: string, label: string): string =>
  prefix + createHash("sha256").update(`${seed}:${label}`).digest("base64url");

export const hex32 = (seed: string, label: string): string =>
  createHash("sha256").update(`${seed}:${label}`).digest("hex").slice(0, 32);

export type ProblemBody = Omit<PlayProblem, "snapshot">;

export const ownProblem = (code: ErrorCode, status: number): ProblemBody => ({
  type: "about:blank",
  title: "Play error",
  status,
  code,
  retryable: false,
  requestId: `req_fake_${code.toLowerCase()}`,
});

export const routeOf = (
  path: string,
  method: string,
): PlayOperationId | undefined =>
  PLAY_OPERATIONS.find(
    id => PLAY_ROUTES[id].path === path && PLAY_ROUTES[id].method === method,
  );

const NOT_JSON: unique symbol = Symbol("not JSON");

export const decodeBody = (text: string | null): unknown => {
  if (text === null || text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return NOT_JSON;
  }
};

const BEARER = /^Bearer (\S+)$/u;

export const bearerOf = (
  authorization: string | undefined,
): string | undefined =>
  authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The only keywords a `version` definition may have for an override. */
const VERSION_KEYWORDS: ReadonlySet<string> = new Set([
  "description",
  "type",
  "minimum",
]);

/**
 * Whether `version` is a value `schema` allows for a Snapshot's `version`: an
 * `integer` at or above its `minimum`. Fails closed: a `version` definition of
 * another shape, or with any keyword but `description`, `type`, and `minimum`
 * (one this check does not apply), allows no override.
 */
export const allowedVersionIn = (
  schema: Readonly<Record<string, unknown>>,
  version: number,
): boolean => {
  const properties = schema["properties"];
  const definition = isRecord(properties) ? properties["version"] : undefined;
  if (!isRecord(definition) || definition["type"] !== "integer") return false;
  if (Object.keys(definition).some(key => !VERSION_KEYWORDS.has(key))) {
    return false;
  }
  const minimum = definition["minimum"];
  return (
    typeof minimum === "number" &&
    Number.isSafeInteger(version) &&
    version >= minimum
  );
};

/** `allowedVersionIn` the vendored `se.snapshot/1` schema. */
export const allowedVersion = (version: number): boolean =>
  allowedVersionIn(snapshotSchema, version);

/** The body of a Snapshot answer: the vector, or it at another `version`. */
export const snapshotBody = (
  answer: Extract<Answer, { readonly kind: "snapshot" | "snapshot-version" }>,
): Readonly<Record<string, unknown>> => {
  const { input } = validVector(answer.vector, "Snapshot");
  return answer.kind === "snapshot"
    ? input
    : { ...input, version: answer.version };
};

/** Checks a scripted answer against the document before it is queued. */
export const checkAnswer = (id: PlayOperationId, answer: Answer): void => {
  if (answer.kind === "snapshot") {
    validVector(answer.vector, "Snapshot");
    return;
  }
  if (answer.kind === "snapshot-version") {
    validVector(answer.vector, "Snapshot");
    if (!allowedVersion(answer.version)) {
      throw new Error(
        `version ${String(answer.version)} for "${answer.vector}" is not one the Snapshot schema allows`,
      );
    }
    return;
  }
  if (answer.kind === "invalid-snapshot") {
    invalidVector(answer.vector);
    return;
  }
  if (answer.kind === "own-problem") {
    if (!isListedStatus(id, answer.status)) {
      throw new Error(
        `own problem ${answer.code} has status ${String(answer.status)}, which ${id} does not list`,
      );
    }
    return;
  }
  if (answer.kind !== "problem") return;
  const { input } = validVector(answer.vector, "PlayProblem");
  const status = input["status"];
  if (
    typeof status !== "number" ||
    status === 200 ||
    !isListedStatus(id, status)
  ) {
    throw new Error(
      `problem vector "${answer.vector}" has status ${String(status)}, which ${id} does not list`,
    );
  }
};
