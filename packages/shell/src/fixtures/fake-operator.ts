// Test-only: a fake operator page for the operator channel: the parent window
// the channel posts to, and a way to deliver `message` events from any source
// and origin. Every post is structured-cloned, as `postMessage` does, so a
// value that could not cross a real frame fails the test.

import {
  createOperatorChannel,
  type OperatorChannel,
  type OperatorWindow,
} from "../operator-channel.ts";
import { OPERATOR_SCHEMA } from "../operator-protocol.ts";
import { createWallClock, type WallClock } from "./wall-clock.ts";

export const OPERATOR = "https://casino.example.org";
export const OTHER = "https://evil.example.org";

export const HELLO: Readonly<Record<string, unknown>> = Object.freeze({
  schema: OPERATOR_SCHEMA,
  type: "hello",
});

/** A message the channel posted, with the target origin it named. */
export type Posted = {
  readonly message: unknown;
  readonly targetOrigin: string;
};

export type FakeOperator = {
  readonly parent: OperatorWindow;
  readonly channel: OperatorChannel;
  readonly clock: WallClock;
  readonly posted: Posted[];
  /** Delivers `data`, from the parent and `OPERATOR` unless told otherwise. */
  readonly send: (
    data: unknown,
    from?: { readonly source?: unknown; readonly origin?: string },
  ) => void;
  /** Checks with `OPERATOR` listed and the given ancestors (none by default). */
  readonly check: (
    ancestorOrigins?: readonly string[],
    operatorOrigins?: readonly string[],
  ) => ReturnType<OperatorChannel["check"]>;
};

export const createFakeOperator = (): FakeOperator => {
  const posted: Posted[] = [];
  const parent: OperatorWindow = {
    postMessage: (message, targetOrigin) => {
      posted.push({ message: structuredClone(message), targetOrigin });
    },
  };
  const channel = createOperatorChannel({ parent });
  const clock = createWallClock(0);
  return {
    parent,
    channel,
    clock,
    posted,
    send: (data, from = {}) => {
      channel.receive({
        source: "source" in from ? from.source : parent,
        origin: from.origin ?? OPERATOR,
        data,
      });
    },
    check: (ancestorOrigins, operatorOrigins = [OPERATOR]) =>
      channel.check({ operatorOrigins, ancestorOrigins, clock }),
  };
};

export const WELCOME_POST: Posted = Object.freeze({
  message: { schema: OPERATOR_SCHEMA, type: "welcome" },
  targetOrigin: OPERATOR,
});
