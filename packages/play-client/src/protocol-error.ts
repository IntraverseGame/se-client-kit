import { describeRequest, type RequestDescription } from "./errors.ts";
import type { NetworkError } from "./network-error.ts";
import type { ProblemError } from "./problem-error.ts";

/**
 * A response the client cannot use: an error status without a problem body, or
 * a body that is not JSON.
 */
export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
  readonly method: string;
  readonly path: string;
  readonly status: number;

  constructor(request: RequestDescription, status: number, what: string) {
    super(`${describeRequest(request, status)}: ${what}`);
    this.method = request.method;
    this.path = request.path;
    this.status = status;
  }
}

/** Any error the client throws for a request. */
export type PlayClientError = NetworkError | ProblemError | ProtocolError;
