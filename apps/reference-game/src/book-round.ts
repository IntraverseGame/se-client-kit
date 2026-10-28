// A book round (the `playback` presentation, W-50 to W-56), read from the
// game's copy of a Snapshot. The game plays the base mode, the one
// `config.model` names, and the player makes no move: the round draws one row
// (a "book") and the copy of the ended round carries it, which the game shows
// at once. The game knows nothing of the package's event types.

import type {
  GameBookDraw,
  GamePlaybackSnapshot,
} from "@intraverse/se-client-shell/controller";

import { BOOK_STATUSES, type BookStatus } from "./book-snapshot.ts";
import { oneOf } from "./plain-data.ts";

/** The round as the game shows it. */
export type BookRound = {
  readonly version: number;
  readonly status: BookStatus;
  /** The mode the round plays (`config.model`). */
  readonly model: string;
  /** The drawn book, on `won` and `lost` when the copy carries it. */
  readonly draw: GameBookDraw | undefined;
  readonly appearance: "dark" | "light" | undefined;
  readonly device: "desktop" | "mobile";
};

/**
 * The book round of `snapshot`, or `undefined` for a status a book round does
 * not show (the parser never lets one through).
 */
export const bookRound = (
  snapshot: GamePlaybackSnapshot,
): BookRound | undefined => {
  const { status } = snapshot;
  if (!oneOf(status, BOOK_STATUSES)) return undefined;
  return Object.freeze({
    version: snapshot.version,
    status,
    model: snapshot.config.model,
    draw: snapshot.config.draw,
    appearance: snapshot.context.theme.appearance,
    device: snapshot.context.device,
  });
};
