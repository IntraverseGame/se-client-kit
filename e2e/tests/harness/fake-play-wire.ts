// The wire side of the fake Play API: the scripted answers it accepts, checked
// against the vendored document and vectors before they are queued; the
// problems it writes itself; how it reads a request (route, token, body); and
// the deterministic secrets it derives from its seed.

import { createHash } from "node:crypto";

import type { ErrorCode, PlayProblem } from "@intraverse/se-client-contracts";

import {
  PLAY_OPERATIONS,
  PLAY_ROUTES,
  isListedStatus,
  type PlayOperationId,
  type SnapshotOperationId,
} from "./play-api-document.ts";
import { validVector } from "./vectors.ts";

/** One scripted answer of an operation. */
export type Answer<Id extends PlayOperationId = PlayOperationId> =
  | (Id extends SnapshotOperationId
      ? {
          /** 200 with the `valid/` Snapshot vector of this name. */
          readonly kind: "snapshot";
          readonly vector: string;
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

/** Checks a scripted answer against the document before it is queued. */
export const checkAnswer = (id: PlayOperationId, answer: Answer): void => {
  if (answer.kind === "snapshot") {
    validVector(answer.vector, "Snapshot");
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
