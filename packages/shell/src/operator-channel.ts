// The operator channel (W-49 to W-49d, ADR-006): the `se.operator/1`
// handshake with the page that embeds the Wrapper, which gates the session,
// and `resize`. The operator page sends first; the channel records, then
// checks:
//
// 1. From boot, before the configuration is validated, it records the first
//    well-formed `hello` from `window.parent`, with its browser-set origin,
//    and answers nothing.
// 2. `check`, once the configuration is validated, checks a recorded `hello`
//    at once (a listed origin opens the channel; any other is final, since the
//    parent's origin cannot change), or else starts the handshake timer.
// 3. The first valid `hello` (from the parent, on `operatorOrigins`, and equal
//    to `location.ancestorOrigins[0]` where that exists) fixes the operator
//    origin for the document's life; the channel posts `welcome` to it. A
//    later valid `hello` from that origin gets `welcome` again and changes
//    nothing else.
// 4. With no valid `hello` within the timeout, the channel is refused, finally:
//    a late `hello` is ignored.
//
// A message that fails a check is ignored and never answered, and nothing is
// posted except to the fixed operator origin (never `"*"` or `"/"`). The
// channel holds no key, no token, and no launch code, and logs nothing; it
// touches no global: the parent window and the clock are injected.

import type { Clock } from "@intraverse/se-client-play-client";

import {
  isOperatorHello,
  OPERATOR_SCHEMA,
  type OperatorBoundMessage,
  resizeHeight,
  WELCOME,
} from "./operator-protocol.ts";

/** The handshake timeout (W-49c; SHOULD 10 s, provisional). */
export const HANDSHAKE_TIMEOUT_MS = 10_000;

/** The operator page's window (`window.parent`): only `postMessage`. */
export type OperatorWindow = {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
};

/** The parts of a `MessageEvent` the channel reads. */
export type OperatorMessageEvent = {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
};

/** Why the handshake failed; the Wrapper logs it as `embedding.refused`. */
export type HandshakeRefusal =
  /**
   * The `hello` recorded before validation came from an origin that fails the
   * check: not on `operatorOrigins`, or not `location.ancestorOrigins[0]` where
   * that list exists.
   */
  | "operator-not-allowed"
  /** No valid `hello` arrived within the timeout. */
  | "handshake-timeout";

export type HandshakeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: HandshakeRefusal };

/** Where the channel is. */
export type OperatorChannelState =
  /** Before `check`: the first well-formed `hello` is recorded, unanswered. */
  | "recording"
  /** After `check`, with no `hello` recorded: the timer runs. */
  | "waiting"
  /** The handshake is accepted: the operator origin is fixed. */
  | "open"
  /** The handshake failed: final for the page. */
  | "refused";

/** What `check` is given once the configuration is validated. */
export type OperatorCheck = {
  /** The configuration's `operatorOrigins` (exact match). */
  readonly operatorOrigins: readonly string[];
  /** `location.ancestorOrigins`, nearest first; `undefined` where absent. */
  readonly ancestorOrigins: readonly string[] | undefined;
  /** The handshake timer's clock. */
  readonly clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  /** `HANDSHAKE_TIMEOUT_MS` unless given. */
  readonly timeoutMs?: number;
};

export type OperatorChannel = {
  /** Takes a `message` event the Wrapper routed from `window.parent`. */
  readonly receive: (event: OperatorMessageEvent) => void;
  /**
   * Checks the handshake once the configuration is validated, and resolves once
   * it is accepted or refused. A second call answers the first's outcome.
   */
  readonly check: (check: OperatorCheck) => Promise<HandshakeOutcome>;
  /**
   * Tells the operator page the height the content needs (W-49d): only once the
   * channel is open, to the fixed origin, as an integer from 1 to
   * `MAX_RESIZE_HEIGHT`, and never the same value twice in a row.
   */
  readonly resize: (measured: number) => void;
  readonly state: () => OperatorChannelState;
};

/** Before `check`, no origin is allowed. */
const NONE_ALLOWED = (): boolean => false;
const NOTHING = (): void => {};

/** Opens the operator channel to `parent`, recording until `check`. */
export const createOperatorChannel = (options: {
  readonly parent: OperatorWindow;
}): OperatorChannel => {
  const { parent } = options;
  let state: OperatorChannelState = "recording";
  let recorded: string | undefined;
  let operatorOrigin: string | undefined;
  let lastHeight: number | undefined;
  let allowed: (origin: string) => boolean = NONE_ALLOWED;
  let outcome: Promise<HandshakeOutcome> | undefined;
  let settle: (result: HandshakeOutcome) => void = NOTHING;
  let stopTimer: () => void = NOTHING;

  const post = (message: OperatorBoundMessage): void => {
    if (operatorOrigin === undefined) return;
    try {
      parent.postMessage(message, operatorOrigin);
    } catch {
      // A parent that throws: the message is dropped.
    }
  };

  const accept = (origin: string): void => {
    state = "open";
    operatorOrigin = origin;
    stopTimer();
    post(WELCOME);
    settle(Object.freeze({ ok: true }));
  };

  const refuse = (reason: HandshakeRefusal): void => {
    state = "refused";
    stopTimer();
    settle(Object.freeze({ ok: false, reason }));
  };

  const receive = (event: OperatorMessageEvent): void => {
    if (event.source !== parent || !isOperatorHello(event.data)) return;
    if (state === "recording") {
      // Only the first is kept; nothing is answered before `check`.
      recorded ??= event.origin;
    } else if (state === "waiting") {
      if (allowed(event.origin)) accept(event.origin);
    } else if (state === "open" && event.origin === operatorOrigin) {
      // The first counts; a repeat from the fixed origin is welcomed again.
      post(WELCOME);
    }
    // Refused: final, nothing is read.
  };

  const check = (given: OperatorCheck): Promise<HandshakeOutcome> => {
    if (outcome !== undefined) return outcome;
    outcome = new Promise<HandshakeOutcome>(resolve => {
      settle = resolve;
    });
    const origins: readonly string[] = Object.freeze([
      ...given.operatorOrigins,
    ]);
    const nearest =
      given.ancestorOrigins === undefined
        ? undefined
        : { origin: given.ancestorOrigins[0] };
    allowed = (origin: string): boolean =>
      origins.includes(origin) &&
      (nearest === undefined || nearest.origin === origin);
    if (recorded !== undefined) {
      // The parent's origin cannot change: waiting would not help.
      if (allowed(recorded)) {
        accept(recorded);
      } else {
        refuse("operator-not-allowed");
      }
      return outcome;
    }
    state = "waiting";
    const { clock } = given;
    const timer = clock.setTimeout(() => {
      if (state === "waiting") refuse("handshake-timeout");
    }, given.timeoutMs ?? HANDSHAKE_TIMEOUT_MS);
    stopTimer = (): void => {
      clock.clearTimeout(timer);
    };
    return outcome;
  };

  const resize = (measured: number): void => {
    if (state !== "open") return;
    const height = resizeHeight(measured);
    if (height === undefined || height === lastHeight) return;
    lastHeight = height;
    post(Object.freeze({ schema: OPERATOR_SCHEMA, type: "resize", height }));
  };

  return Object.freeze({
    receive,
    check,
    resize,
    state: (): OperatorChannelState => state,
  });
};
