/**
 * Where a failed request went. An error carries the method, the path, the
 * status, and the `requestId` of a request, never its headers or its body
 * (W-4): no token, launch code, or signed bytes can reach a message.
 */
export type RequestDescription = {
  readonly method: string;
  readonly path: string;
};

/** The message of a client error: method, path, status, and `requestId` only. */
export const describeRequest = (
  request: RequestDescription,
  status?: number,
  requestId?: string,
): string => {
  const parts = [`${request.method} ${request.path}`];
  if (status !== undefined) {
    parts.push(String(status));
  }
  if (requestId !== undefined) {
    parts.push(`requestId ${requestId}`);
  }
  return parts.join(" ");
};
