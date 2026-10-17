// W-49's fail-closed minimum (decided in human review, 2026-10-17), applied
// before the session opens: a framed Wrapper opens no session (no redeem, no
// key, no signature, no game) unless it can prove every page that frames it is
// on `operatorOrigins`. `frame-ancestors`, set by the host, stays the primary
// control; this is defense in depth.
//
// - Not framed (`window.parent === window`): unchanged.
// - Framed, where `location.ancestorOrigins` exists: every entry must be on
//   `operatorOrigins` (exact match); a masked entry (`"null"`) refuses, and so
//   does an empty list (a framed page always has an ancestor).
// - Framed, where it does not exist (Firefox): refused. The operator handshake
//   that would lift this is RFC-001's (the operator launch contract), not built.
//
// It is the minimum until RFC-001 is accepted and built. Only a reason code is
// logged, never an origin.

/** What the page knows of its framing, read from the platform once. */
export type EmbeddingContext = {
  /** `window.parent !== window`. */
  readonly framed: boolean;
  /** `location.ancestorOrigins`, nearest first; `undefined` where absent. */
  readonly ancestorOrigins: readonly string[] | undefined;
};

/** Why a framed Wrapper refused to open a session. */
export type EmbeddingRefusal =
  /** An ancestor origin is not on `operatorOrigins`. */
  | "ancestor-not-allowed"
  /** An ancestor origin is masked (`"null"`). */
  | "ancestor-masked"
  /**
   * Framed with no `location.ancestorOrigins` to check (Firefox), or an empty
   * one: nothing proves who frames the page.
   */
  | "ancestors-unknown";

export type EmbeddingVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: EmbeddingRefusal };

const ALLOWED: EmbeddingVerdict = Object.freeze({ ok: true });

const refused = (reason: EmbeddingRefusal): EmbeddingVerdict =>
  Object.freeze({ ok: false, reason });

/** Whether the session may open for this framing (W-49's minimum). */
export const checkEmbedding = (
  context: EmbeddingContext,
  operatorOrigins: readonly string[],
): EmbeddingVerdict => {
  if (!context.framed) return ALLOWED;
  const ancestors = context.ancestorOrigins;
  if (ancestors === undefined || ancestors.length === 0) {
    return refused("ancestors-unknown");
  }
  if (ancestors.includes("null")) return refused("ancestor-masked");
  return ancestors.every(origin => operatorOrigins.includes(origin))
    ? ALLOWED
    : refused("ancestor-not-allowed");
};

/** The parts of the platform `window` the context is read from. */
export type FramingWindow = {
  readonly parent: unknown;
  readonly self: unknown;
  readonly location: { readonly ancestorOrigins?: Iterable<string> };
};

/** Reads the page's framing from the platform. */
export const embeddingOf = (window: FramingWindow): EmbeddingContext => {
  const list = window.location.ancestorOrigins;
  return {
    framed: window.parent !== window.self,
    ancestorOrigins: list === undefined ? undefined : [...list],
  };
};
