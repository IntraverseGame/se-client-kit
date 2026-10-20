// The `se.operator/1` message set (W-49b, ADR-006): the closed protocol
// between the operator page (the Wrapper's `window.parent`) and the Wrapper,
// apart from the game's `se.controller/1`. The operator sends `hello` only;
// the Wrapper sends `welcome` and `resize`. No message carries a secret, a
// session id, a round id, an amount, or a URL. Within `/1` the set and every
// message's fields are frozen.

import { hasExactly, plainFields } from "./plain-fields.ts";

export const OPERATOR_SCHEMA = "se.operator/1";

/** The operator's only message: "I am the page that embeds you". */
export type OperatorHello = {
  readonly schema: typeof OPERATOR_SCHEMA;
  readonly type: "hello";
};

/** The handshake is accepted; the operator stops repeating `hello`. */
export type WelcomeMessage = {
  readonly schema: typeof OPERATOR_SCHEMA;
  readonly type: "welcome";
};

/** The height the Wrapper's content needs, in CSS pixels (W-49d). */
export type ResizeMessage = {
  readonly schema: typeof OPERATOR_SCHEMA;
  readonly type: "resize";
  readonly height: number;
};

/** What the Wrapper posts to the operator page. */
export type OperatorBoundMessage = WelcomeMessage | ResizeMessage;

/**
 * The largest `height` a `resize` carries; a larger one is sent as this
 * (provisional, decided 2026-10-18, RFC-001 Q15).
 */
export const MAX_RESIZE_HEIGHT = 16_384;

/**
 * Whether `data` is a well-formed `hello`: a plain object with exactly `schema:
 * "se.operator/1"` and `type: "hello"`, read through its own data properties
 * only. A string (a JSON text included), an array, a non-plain object, an
 * accessor, a symbol key, a missing or extra field, another schema, or another
 * `type` is not.
 */
export const isOperatorHello = (data: unknown): boolean => {
  const fields = plainFields(data);
  return (
    fields !== undefined &&
    hasExactly(fields, ["schema", "type"]) &&
    fields.get("schema") === OPERATOR_SCHEMA &&
    fields.get("type") === "hello"
  );
};

export const WELCOME: WelcomeMessage = Object.freeze({
  schema: OPERATOR_SCHEMA,
  type: "welcome",
});

/**
 * The `height` a `resize` carries for a measured height: an integer from 1 to
 * `MAX_RESIZE_HEIGHT` (rounded up, a larger one sent as the bound), or
 * `undefined` for a value that is not a finite number.
 */
export const resizeHeight = (measured: number): number | undefined =>
  Number.isFinite(measured)
    ? Math.min(MAX_RESIZE_HEIGHT, Math.max(1, Math.ceil(measured)))
    : undefined;
