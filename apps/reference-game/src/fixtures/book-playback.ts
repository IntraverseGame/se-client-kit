// Test-only: the game's copies of book-round Snapshots (the `playback`
// presentation), as the bridge builds them from the vendored
// `snapshot/valid/book-playback-*` vectors (only W-38's `playback` allow-list):
// the copy of `won` from `book-playback-won-payout` with its two events, and
// `idle`, `starting`, and `lost` built the same way. Written out by hand: the
// game's tests take nothing of the kit at run time.

import type {
  GameBookDraw,
  GamePlaybackSnapshot,
  RoundStatus,
} from "@intraverse/se-client-shell/controller";

const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

const base = (
  version: number,
  status: RoundStatus,
  extra: Partial<GamePlaybackSnapshot> = {},
  draw?: GameBookDraw,
): GamePlaybackSnapshot => ({
  version,
  presentation: "playback",
  status,
  context: {
    language: "de",
    device: "mobile",
    theme: { appearance: "dark" },
  },
  config: {
    kind: "book",
    model: "base",
    ...(draw === undefined ? {} : { draw }),
  },
  ...extra,
});

/** The draw of `book-playback-won-payout`: book 41, ×1.94, two events. */
export const WON_DRAW: GameBookDraw = {
  index: 41,
  payoutMultiplier: 1.94,
  events: [
    { index: 0, type: "reveal", data: { side: "heads" } },
    { index: 1, type: "win" },
  ],
};

/** A losing draw built the same way: book 7, ×0, two events. */
export const LOST_DRAW: GameBookDraw = {
  index: 7,
  payoutMultiplier: 0,
  events: [
    { index: 0, type: "reveal", data: { side: "tails" } },
    { index: 1, type: "lose" },
  ],
};

/** One copy per status a book round shows (W-54). */
export const BOOK = {
  idle: base(1, "idle"),
  starting: base(2, "starting", { roundId: ROUND_ID }),
  won: base(3, "won", { roundId: ROUND_ID }, WON_DRAW),
  lost: base(3, "lost", { roundId: ROUND_ID }, LOST_DRAW),
} as const satisfies Readonly<Record<string, GamePlaybackSnapshot>>;

/** `snapshot` with `draw` as its `config.draw`. */
export const withDraw = (
  snapshot: GamePlaybackSnapshot,
  draw: unknown,
): Record<string, unknown> => ({
  ...snapshot,
  config: { ...snapshot.config, draw },
});

/** `snapshot` with no `config.draw`. */
export const withoutDraw = (
  snapshot: GamePlaybackSnapshot,
): GamePlaybackSnapshot => ({
  ...snapshot,
  config: { kind: "book", model: snapshot.config.model },
});

/** The won copy with `events` as its draw's events. */
export const withEvents = (events: unknown): Record<string, unknown> =>
  withDraw(BOOK.won, { ...WON_DRAW, events });
