// One call of the tip check (W-26b, W-43): sent to one endpoint through the
// injected transport, with its own timeout on the injected clock and its own
// abort signal, its result read as untrusted data.

import type { Clock } from "@intraverse/se-client-play-client";

import type { RpcEndpoint } from "./config-fields.ts";
import {
  platformAbortController,
  type RpcCall,
  type RpcTransport,
} from "./rpc-transport.ts";

/** What a call gives when it did not answer in time with a usable result. */
export const NO_ANSWER: unique symbol = Symbol("no answer");

/** The transport and the timers a call is made with. */
export type AskOptions = {
  readonly transport: RpcTransport;
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
};

/**
 * One call with its timeout: what `read` makes of the result, or `NO_ANSWER` on
 * a rejection, a timeout (which aborts the call's signal), or a result `read`
 * refuses.
 */
export const ask = <T>(
  options: AskOptions,
  timeoutMs: number,
  endpoint: RpcEndpoint,
  call: RpcCall,
  read: (result: unknown) => T | undefined,
): Promise<T | typeof NO_ANSWER> =>
  new Promise(resolve => {
    const controller = platformAbortController();
    const handle = options.clock.setTimeout(() => {
      resolve(NO_ANSWER);
      controller?.abort();
    }, timeoutMs);
    const settle = (value: T | typeof NO_ANSWER): void => {
      options.clock.clearTimeout(handle);
      resolve(value);
    };
    const answer = async (): Promise<void> => {
      try {
        const result = await options.transport(
          endpoint,
          call,
          controller?.signal,
        );
        settle(read(result) ?? NO_ANSWER);
      } catch {
        // A rejection, or a transport that throws at once: no answer.
        settle(NO_ANSWER);
      }
    };
    void answer();
  });
