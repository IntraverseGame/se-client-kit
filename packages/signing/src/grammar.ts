// The canonical spelling of the action text. PROVISIONAL: the action grammar
// belongs to the backend's signed-action specification, which is not
// published yet. Until it is, this module holds only the spellings the
// vendored signing vectors pin, and it is the one place to replace when the
// specification lands. Nothing else in the package depends on it.

import { SigningError } from "./errors.ts";

/** Builds the canonical action text; the caller never spells it. */
export type ActionGrammar = {
  /**
   * `pick row <row> tile <tile>`, with `row` and `tile` as non-negative
   * integers in canonical decimal.
   */
  readonly pick: (row: number, tile: number) => string;
  /** The action text of a cash-out. */
  readonly cashOut: () => string;
};

const index = (value: number): string => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SigningError("invalid-input");
  }
  return String(value);
};

/** The spellings of the worked-round signing vectors. */
export const provisionalGrammar: ActionGrammar = Object.freeze({
  pick: (row: number, tile: number): string =>
    `pick row ${index(row)} tile ${index(tile)}`,
  cashOut: (): string => "cash out",
});
