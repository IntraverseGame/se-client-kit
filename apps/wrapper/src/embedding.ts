// W-49a, the framing decision (specs/wrapper/operator-embedding.md, ADR-006),
// taken once the configuration is validated and before the session opens (no
// redeem, no key, no signature, no game). `frame-ancestors`, set by the host,
// stays the primary control; this is defense in depth.
//
// - Not framed (`window.parent === window`): a standalone launch, with no
//   handshake and no operator channel.
// - Framed and nested (`window.parent !== window.top`, or more than one
//   `location.ancestorOrigins` entry): refused. Only direct embedding is
//   supported.
// - Framed, where `location.ancestorOrigins` exists: refused unless it holds
//   exactly one entry and that entry is on `operatorOrigins` (exact match); a
//   masked entry (`"null"`) refuses, and so does an empty list. A listed entry
//   still needs the `se.operator/1` handshake (W-49c, the shell's operator
//   channel).
// - Framed, where `location.ancestorOrigins` is missing: the handshake.
//
// A refusal is logged as `embedding.refused` with its reason code only, never
// an origin.

/** What the page knows of its framing, read from the platform once. */
export type EmbeddingContext = {
  /** `window.parent !== window`. */
  readonly framed: boolean;
  /** `window.parent !== window.top`: framed through another page. */
  readonly nested: boolean;
  /** `location.ancestorOrigins`, nearest first; `undefined` where absent. */
  readonly ancestorOrigins: readonly string[] | undefined;
};

/** Why a framed Wrapper refused to open a session (W-49a). */
export type EmbeddingRefusal =
  /** The ancestor origin is not on `operatorOrigins`. */
  | "ancestor-not-allowed"
  /** The ancestor origin is masked (`"null"`). */
  | "ancestor-masked"
  /** Framed, with an empty `location.ancestorOrigins`. */
  | "ancestors-unknown"
  /** Framed through another page: only direct embedding is supported. */
  | "nested";

export type EmbeddingVerdict =
  /** `handshake`: framed, so the session waits for the handshake (W-49c). */
  | { readonly ok: true; readonly handshake: boolean }
  | { readonly ok: false; readonly reason: EmbeddingRefusal };

const STANDALONE: EmbeddingVerdict = Object.freeze({
  ok: true,
  handshake: false,
});
const HANDSHAKE: EmbeddingVerdict = Object.freeze({
  ok: true,
  handshake: true,
});

const refused = (reason: EmbeddingRefusal): EmbeddingVerdict =>
  Object.freeze({ ok: false, reason });

/** Whether the session may open for this framing, and after a handshake. */
export const checkEmbedding = (
  context: EmbeddingContext,
  operatorOrigins: readonly string[],
): EmbeddingVerdict => {
  if (!context.framed) return STANDALONE;
  const ancestors = context.ancestorOrigins;
  if (context.nested || (ancestors !== undefined && ancestors.length > 1)) {
    return refused("nested");
  }
  if (ancestors === undefined) return HANDSHAKE;
  const [nearest] = ancestors;
  if (nearest === undefined) return refused("ancestors-unknown");
  if (nearest === "null") return refused("ancestor-masked");
  return operatorOrigins.includes(nearest)
    ? HANDSHAKE
    : refused("ancestor-not-allowed");
};

/** The parts of the platform `window` the context is read from. */
export type FramingWindow = {
  readonly parent: unknown;
  readonly self: unknown;
  readonly top: unknown;
  readonly location: { readonly ancestorOrigins?: Iterable<string> };
};

/** Reads the page's framing from the platform. */
export const embeddingOf = (window: FramingWindow): EmbeddingContext => {
  const list = window.location.ancestorOrigins;
  return {
    framed: window.parent !== window.self,
    nested: window.parent !== window.top,
    ancestorOrigins: list === undefined ? undefined : [...list],
  };
};
