// The Wrapper's side of `se.delegation/1` with one signing window (W-66, W-67):
// it waits 10 s for the window's first `ready`, answers it with the one
// `request`, and takes the first `result` or `failed` after it. It reads the
// window's `closed` every 500 ms from the start until an answer, the end of the
// wait for `ready` with none, or `stop` (a `ready` does not stop it); a window
// first seen closed ends the wait as declined at the next read, not at once,
// so an answer the page posted just before closing itself (SP-9) and still
// queued is taken. It closes the window whenever the wait ends. A message is
// taken only when its `event.source` is the window's handle and its
// `event.origin` is the signing page's origin exactly; anything else is ignored
// and never answered. Like the operator channel it touches no global: the
// handle, the origin, and the clock are given. It logs nothing.

import type { Clock, TimerHandle } from "@intraverse/se-client-play-client";

import {
  DELEGATION_CLOSED_POLL_MS,
  DELEGATION_READY_TIMEOUT_MS,
  type DelegationAnswer,
  type DelegationRequest,
  isDelegationReady,
  readDelegationAnswer,
} from "./delegation-protocol.ts";
import type { DelegationEvent, DelegationWindow } from "./delegation-types.ts";

/** How the wait for the window ended. */
export type DelegationChannelEnd =
  | { readonly kind: "answer"; readonly answer: DelegationAnswer }
  /** The window was closed before an answer: the player declined. */
  | { readonly kind: "closed" }
  /** No valid `ready` within the wait. */
  | { readonly kind: "no-ready" };

export type DelegationChannelOptions = {
  readonly handle: DelegationWindow;
  /** The configured `signingPageOrigin`, compared exactly. */
  readonly signingPageOrigin: string;
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** The one `request`, posted when the first `ready` arrives. */
  readonly request: DelegationRequest;
  /** Called once, when the wait ends other than by `stop`. */
  readonly onEnd: (end: DelegationChannelEnd) => void;
};

export type DelegationChannel = {
  /** A `message` event the Wrapper routed from the window's handle. */
  readonly receive: (event: DelegationEvent) => void;
  /** Ends the wait with no outcome: the window is closed, nothing posted. */
  readonly stop: () => void;
};

export const openDelegationChannel = (
  options: DelegationChannelOptions,
): DelegationChannel => {
  const { handle, signingPageOrigin, clock } = options;
  let requested = false;
  let done = false;
  let readyTimer: TimerHandle | undefined;
  let pollTimer: TimerHandle | undefined;
  /** `closed` was true at a read: the next read ends the wait. */
  let closedSeen = false;

  const clear = (timer: TimerHandle | undefined): void => {
    if (timer !== undefined) clock.clearTimeout(timer);
  };

  const finish = (end?: DelegationChannelEnd): void => {
    if (done) return;
    done = true;
    clear(readyTimer);
    clear(pollTimer);
    readyTimer = undefined;
    pollTimer = undefined;
    try {
      handle.close();
    } catch {
      // A window that is gone cannot be closed again.
    }
    if (end !== undefined) options.onEnd(end);
  };

  const isClosed = (): boolean => {
    try {
      return handle.closed;
    } catch {
      return false;
    }
  };

  const poll = (): void => {
    pollTimer = clock.setTimeout(() => {
      pollTimer = undefined;
      if (done) return;
      if (isClosed()) {
        // The page posts its answer, then closes itself (SP-9): `closed` can
        // read true before the answer's `message` event has run. One more
        // read's time lets a queued answer arrive; a window the player closed
        // ends as declined at that read (W-66).
        if (closedSeen) {
          finish({ kind: "closed" });
          return;
        }
        closedSeen = true;
      }
      poll();
    }, DELEGATION_CLOSED_POLL_MS);
  };

  readyTimer = clock.setTimeout(() => {
    readyTimer = undefined;
    if (!requested) finish({ kind: "no-ready" });
  }, DELEGATION_READY_TIMEOUT_MS);
  poll();

  const receive = (event: DelegationEvent): void => {
    if (done || event.source !== handle) return;
    if (event.origin !== signingPageOrigin) return;
    if (!requested) {
      if (!isDelegationReady(event.data)) return;
      requested = true;
      clear(readyTimer);
      readyTimer = undefined;
      // Never `"*"`: only the signing page's origin may read it.
      handle.postMessage(options.request, signingPageOrigin);
      return;
    }
    // A later `ready`, or anything malformed, is ignored.
    const answer = readDelegationAnswer(event.data);
    if (answer !== undefined) finish({ kind: "answer", answer });
  };

  return Object.freeze({
    receive,
    stop: (): void => {
      finish();
    },
  });
};
