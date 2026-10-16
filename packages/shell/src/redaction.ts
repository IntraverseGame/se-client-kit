// The redacting types (W-4). Anything that holds a secret, or a closure over
// one, prints `[redacted]` under `String()`, `JSON.stringify`, template
// literals, and the runtime's inspect hook. A secret value itself is kept out of
// the object that stands for it, in a module-private `WeakMap`, so no property
// walk, `structuredClone`, or `postMessage` copy of the object can reach it.

/** What every redacting value prints. */
export const REDACTED = "[redacted]";

// Node's `util.inspect` (and so `console.log` under Node and Vitest) calls this.
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

const print = (): string => REDACTED;

// The four hooks live on a shared, frozen prototype, not on the object: they
// are not own properties, so a clone copies none of them, and an object built
// on it has nothing to enumerate but what its caller gave it.
const REDACTING_PROTOTYPE: object = Object.freeze(
  Object.create(Object.prototype, {
    toString: { value: print },
    toJSON: { value: print },
    [Symbol.toPrimitive]: { value: print },
    [INSPECT]: { value: print },
  }),
);

/**
 * Freezes `members` onto a redacting object: it keeps their behavior and prints
 * `[redacted]` in every form.
 */
export const redacting = <T extends object>(members: T): Readonly<T> =>
  Object.freeze(
    Object.assign(Object.create(REDACTING_PROTOTYPE) as T, members),
  );

declare const SECRET_KIND: unique symbol;

/** The secrets the shell holds as text. The action key is a closure instead. */
export type SecretKind = "play-token" | "launch-code";

/**
 * A secret, sealed: it prints `[redacted]` and carries no readable value. Only
 * this module's `revealSecret` returns the text, and only inside the shell.
 */
export type Secret<K extends SecretKind> = {
  readonly [SECRET_KIND]: K;
};

/** The play token (W-3): memory only, sent only in `Authorization`. */
export type PlayToken = Secret<"play-token">;

/** The launch code (W-1): read once from the fragment, redeemed once. */
export type LaunchCode = Secret<"launch-code">;

const sealed = new WeakMap<object, string>();

/** Seals `value` as a secret of `kind`. */
export const sealSecret = <K extends SecretKind>(
  _kind: K,
  value: string,
): Secret<K> => {
  const secret = redacting({}) as Secret<K>;
  sealed.set(secret, value);
  return secret;
};

/**
 * The text of a sealed secret. Throws a `TypeError` with a fixed message for a
 * value that is not one, or one already disposed.
 */
export const revealSecret = (secret: Secret<SecretKind>): string => {
  const value = sealed.get(secret);
  if (value === undefined) {
    throw new TypeError("not a live secret");
  }
  return value;
};

/** Forgets a secret's text: a later `revealSecret` throws. */
export const disposeSecret = (secret: Secret<SecretKind>): void => {
  sealed.delete(secret);
};
