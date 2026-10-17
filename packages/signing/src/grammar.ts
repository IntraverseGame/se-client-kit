// The canonical action text and path of a player's message, as the backend's
// signed-action specification publishes them: `pick row <r> tile <o>`,
// `cash out`, and `cancel`, with every number in canonical base 10 and rows
// and tiles counted from 0. A move's `path` holds node ids, never the tile: the
// nodes survived, then the node played, so the row is `len(path) - 1`. The
// module derives the row from the path, so a text whose row disagrees with its
// path cannot be built. A node id is a `uint8` (the messages' `path` type).

import { SigningError } from "./errors.ts";

/** An action's canonical text and its path, ready to be signed. */
export type GrammarAction = {
  readonly action: string;
  readonly path: readonly number[];
};

/** Builds the canonical action text and path; the caller never spells them. */
export type ActionGrammar = {
  /**
   * A move: `path` is the node ids survived, then the node played (at least
   * one), and `tile` the option picked in that node. The text is `pick row
   * <len(path) - 1> tile <tile>`.
   */
  readonly pick: (path: readonly number[], tile: number) => GrammarAction;
  /** A cash-out: `cash out`, with the node ids survived as its path. */
  readonly cashOut: (path: readonly number[]) => GrammarAction;
  /** A cancel: `cancel`, with an empty path. */
  readonly cancel: () => GrammarAction;
};

const UINT8_MAX = 255;

const decimal = (value: number): string => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SigningError("invalid-input");
  }
  return String(value);
};

const nodes = (path: readonly number[]): readonly number[] => {
  if (!Array.isArray(path)) throw new SigningError("invalid-input");
  const copy: number[] = [...path];
  for (const node of copy) {
    if (!Number.isSafeInteger(node) || node < 0 || node > UINT8_MAX) {
      throw new SigningError("invalid-input");
    }
  }
  return Object.freeze(copy);
};

const built = (action: string, path: readonly number[]): GrammarAction =>
  Object.freeze({ action, path });

/** The grammar of the signed-action specification. */
export const actionGrammar: ActionGrammar = Object.freeze({
  pick: (path: readonly number[], tile: number): GrammarAction => {
    const played = nodes(path);
    if (played.length === 0) throw new SigningError("invalid-input");
    return built(
      `pick row ${decimal(played.length - 1)} tile ${decimal(tile)}`,
      played,
    );
  },
  cashOut: (path: readonly number[]): GrammarAction =>
    built("cash out", nodes(path)),
  cancel: (): GrammarAction => built("cancel", Object.freeze([])),
});
