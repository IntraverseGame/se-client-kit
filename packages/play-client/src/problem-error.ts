import { describeRequest, type RequestDescription } from "./errors.ts";
import type { ProblemSummary } from "./problem.ts";

/**
 * An error response with a Play API problem body. The routing fields are read;
 * the body itself stays `unknown` for the `snapshot` package's validator.
 */
export class ProblemError extends Error {
  override readonly name = "ProblemError";
  readonly method: string;
  readonly path: string;
  readonly problem: ProblemSummary;
  /** Non-enumerable, so a console dump shows what the JSON form shows. */
  declare readonly body: unknown;

  constructor(
    request: RequestDescription,
    problem: ProblemSummary,
    body: unknown,
  ) {
    super(
      `${describeRequest(request, problem.status, problem.requestId)}: ${problem.code}`,
    );
    this.method = request.method;
    this.path = request.path;
    this.problem = problem;
    Object.defineProperty(this, "body", {
      value: body,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  /** The body is left out: it is the server's, and may embed a Snapshot. */
  toJSON(): Readonly<Record<string, unknown>> {
    return {
      name: this.name,
      method: this.method,
      path: this.path,
      problem: this.problem,
    };
  }
}
