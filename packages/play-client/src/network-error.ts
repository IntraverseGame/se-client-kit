import { describeRequest, type RequestDescription } from "./errors.ts";

/**
 * Why a request got no response: it timed out, the network failed (a refused
 * redirect included: the platform reports it as a network failure), or the
 * caller aborted it through its signal.
 */
export type NetworkFailure = "timeout" | "network" | "aborted";

const WHAT: Readonly<Record<NetworkFailure, string>> = {
  timeout: "timed out",
  network: "network failure",
  aborted: "aborted",
};

/**
 * A request that ended with no response (offline, DNS, TLS, reset, or the
 * request timeout, W-43). Its outcome is unknown: a mutating call is resent
 * with the same bytes and idempotency key, or the Snapshot is read (W-16). The
 * platform's own error is not kept, so nothing it holds can leak.
 */
export class NetworkError extends Error {
  override readonly name = "NetworkError";
  readonly method: string;
  readonly path: string;
  readonly reason: NetworkFailure;

  constructor(request: RequestDescription, reason: NetworkFailure) {
    super(`${describeRequest(request)}: ${WHAT[reason]}`);
    this.method = request.method;
    this.path = request.path;
    this.reason = reason;
  }
}
