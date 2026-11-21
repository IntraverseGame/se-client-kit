// The signing page's side of `se.delegation/1` (specs/wrapper/the-wallet-
// delegation.md, W-67; specs/signing-page.md, SP-5 to SP-9). The page sends
// `ready`, then one `result` or `failed`; it reads one `request`. A message is
// read only through the own data properties of a plain object with exactly its
// type's fields, each of its type (the message rules): anything else is not a
// message and is never answered. A well-formed `request` whose values break
// W-67's shapes is `invalid-request`. The page cannot import `shell` (SP-1), so
// it spells the same rules again; the shell's half is
// `packages/shell/src/delegation-protocol.ts`.

export const DELEGATION_SCHEMA = "se.delegation/1";

/** Why the page gives no signature, from W-67's closed list. */
export type FailedReason =
  | "no-wallet"
  | "rejected"
  | "unknown-notice"
  | "invalid-request"
  | "wallet-error";

/** What the Wrapper asks the wallet to sign, its values checked. */
export type SigningRequest = {
  /** The shell's action key's address. */
  readonly actionKey: string;
  /** The redeem's `sessionId` (`ses_` and 32 hex digits). */
  readonly sessionId: string;
  /** The session's hard end, unix seconds: a time, never an amount. */
  readonly expiry: number;
  readonly noticeId: string;
};

/** A request read: valid, or well formed with a value off its shape. */
export type RequestReading =
  | { readonly kind: "request"; readonly request: SigningRequest }
  | { readonly kind: "invalid" };

export type ReadyMessage = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "ready";
};

export type ResultMessage = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "result";
  readonly wallet: string;
  readonly signature: string;
};

export type FailedMessage = {
  readonly schema: typeof DELEGATION_SCHEMA;
  readonly type: "failed";
  readonly reason: FailedReason;
};

/** The page's one answer to a request. */
export type AnswerMessage = ResultMessage | FailedMessage;

const REQUEST_FIELDS: readonly string[] = [
  "schema",
  "type",
  "actionKey",
  "sessionId",
  "expiry",
  "noticeId",
];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const ZERO_ADDRESS = /^0x0{40}$/u;
const SESSION_ID = /^ses_[0-9a-f]{32}$/u;
const NOTICE_ID = /^[a-z0-9-]{1,64}$/u;

/**
 * The latest expiry, in unix seconds, that a `Date` can hold (8.64e15 ms): the
 * page shows the expiry as a date and time (SP-10), so a later one is refused
 * as `invalid-request` (SP-6), never shown as raw seconds.
 */
export const MAX_EXPIRY_SECONDS = 8_640_000_000_000;

/**
 * The own data properties of a plain object, or `undefined` for anything else
 * (a string, an array, a class instance, an accessor, a symbol key, a proxy
 * that throws). Reading never runs the sender's code.
 */
const plainFields = (
  value: unknown,
): ReadonlyMap<string, unknown> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(descriptors).length > 0) return undefined;
    const fields = new Map<string, unknown>();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return undefined;
  }
};

/** `0x` and 40 hex digits, either case, never the zero address. */
export const isAddress = (value: string): boolean =>
  ADDRESS.test(value) && !ZERO_ADDRESS.test(value);

/**
 * Reads a `request`: `undefined` when `data` is not a well-formed one (it is
 * then ignored, never answered), `invalid` when its fields have their types but
 * a value breaks W-67's shapes, else the request.
 */
export const readRequest = (data: unknown): RequestReading | undefined => {
  const fields = plainFields(data);
  if (
    fields === undefined ||
    fields.size !== REQUEST_FIELDS.length ||
    !REQUEST_FIELDS.every(name => fields.has(name)) ||
    fields.get("schema") !== DELEGATION_SCHEMA ||
    fields.get("type") !== "request"
  ) {
    return undefined;
  }
  const actionKey = fields.get("actionKey");
  const sessionId = fields.get("sessionId");
  const expiry = fields.get("expiry");
  const noticeId = fields.get("noticeId");
  if (
    typeof actionKey !== "string" ||
    typeof sessionId !== "string" ||
    typeof expiry !== "number" ||
    typeof noticeId !== "string"
  ) {
    return undefined;
  }
  const valid =
    isAddress(actionKey) &&
    SESSION_ID.test(sessionId) &&
    Number.isSafeInteger(expiry) &&
    expiry >= 1 &&
    expiry <= MAX_EXPIRY_SECONDS &&
    NOTICE_ID.test(noticeId);
  return valid
    ? {
        kind: "request",
        request: Object.freeze({ actionKey, sessionId, expiry, noticeId }),
      }
    : { kind: "invalid" };
};

export const readyMessage = (): ReadyMessage =>
  Object.freeze({ schema: DELEGATION_SCHEMA, type: "ready" });

export const resultMessage = (
  wallet: string,
  signature: string,
): ResultMessage =>
  Object.freeze({
    schema: DELEGATION_SCHEMA,
    type: "result",
    wallet,
    signature,
  });

export const failedMessage = (reason: FailedReason): FailedMessage =>
  Object.freeze({ schema: DELEGATION_SCHEMA, type: "failed", reason });
