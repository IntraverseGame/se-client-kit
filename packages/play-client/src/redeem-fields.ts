// The checks of the place to frame the game in a redeem answer (W-37): the
// document's bounds of `RedeemResponse.gameOrigin` and its rule of
// `RedeemResponse.gamePath`.

/** The document's `maxLength` of `RedeemResponse.gameOrigin`. */
const MAX_GAME_ORIGIN = 267;

/**
 * The document's bounds of `gameOrigin`: 1 to 267 characters, counted as JSON
 * Schema counts them (code points). Whether it is an origin, and an allowed
 * one, is the shell's game bridge's check (W-37), not this one.
 */
export const isGameOrigin = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  (value.length <= MAX_GAME_ORIGIN || [...value].length <= MAX_GAME_ORIGIN);

/**
 * The document's rule of `RedeemResponse.gamePath`, the path of the game's page
 * on `gameOrigin`: 1 to 255 characters, starting and ending with `/`, of
 * segments of 1 to 63 unreserved characters that are never `.` or `..`. It is
 * optional: a server that predates it sends none, which means `/`.
 */
const GAME_PATH = /^\/(?:(?!\.\.?\/)[\w.~-]{1,63}\/)*$/u;
const MAX_GAME_PATH = 255;

export const isGamePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_GAME_PATH &&
  GAME_PATH.test(value);
