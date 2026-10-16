/**
 * One player intent (a start, a move, a cash-out, a cancel) and its idempotency
 * key. The key is drawn once and reused for every resend of that intent, never
 * for another (W-16, W-36).
 */
export type Intent = {
  readonly idempotencyKey: string;
};

/** The random source of keys: `crypto.randomUUID` in a browser. */
export type RandomUuid = () => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Starts a new intent with a fresh key from the injected random source.
 * Provisional: the key's length limits and where it travels (a body field or a
 * header) are not fixed by a published Play API document; a UUID
 * (`crypto.randomUUID()`, W-36) is assumed.
 */
export const newIntent = (randomUuid: RandomUuid): Intent => {
  const idempotencyKey = randomUuid().toLowerCase();
  if (!UUID.test(idempotencyKey)) {
    throw new TypeError("the random source did not return a UUID");
  }
  return { idempotencyKey };
};
