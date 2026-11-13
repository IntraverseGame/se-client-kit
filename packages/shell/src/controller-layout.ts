// The `layout` message of the `inset` capability (RFC-005, W-38): sent only to
// a game whose accepted `hello` declared `inset`, first right after that
// `hello` (the acknowledgement), then whenever the value changes; a whole
// number of CSS pixels of at least 0, rounded up.

import {
  CONTROLLER_SCHEMA,
  type GameCapability,
  type LayoutMessage,
} from "./controller-protocol.ts";

export type LayoutSender = {
  /** After a compatible `hello`: acknowledges `inset` with the first value. */
  readonly acknowledge: (
    capabilities: readonly GameCapability[],
    insetBottom: (() => number) | undefined,
  ) => void;
  /** A later value: sent only when acknowledged and changed. */
  readonly send: (insetBottom: number) => void;
};

/** A whole number of CSS pixels, or `undefined` for a value not to send. */
const insetOf = (value: number): number | undefined =>
  Number.isFinite(value) && value >= 0 ? Math.ceil(value) : undefined;

export const createLayoutSender = (
  post: (message: LayoutMessage) => void,
  ready: () => boolean,
): LayoutSender => {
  let inset = false;
  let sent: number | undefined;
  const sendNow = (value: number | undefined): void => {
    if (!inset || !ready() || value === undefined || value === sent) return;
    sent = value;
    post(
      Object.freeze({
        schema: CONTROLLER_SCHEMA,
        type: "layout",
        insetBottom: value,
      }),
    );
  };
  return Object.freeze({
    acknowledge: (capabilities, insetBottom): void => {
      if (!capabilities.includes("inset")) return;
      inset = true;
      sendNow(insetOf(insetBottom?.() ?? 0) ?? 0);
    },
    send: (value: number): void => {
      sendNow(insetOf(value));
    },
  });
};
