// What the UI is given besides its state: the player intents that are wired,
// the environment's verify base, and the lobby and deposit rules.

import type { LinkRules } from "./operator-links.ts";
import type { ShownAmount } from "./round-input.ts";

/**
 * What the player can ask for. A control is shown only when its intent is
 * wired: the start, cash-out, and "check again" intents come from the session.
 */
export type Intents = {
  readonly start?: (bet: ShownAmount) => void;
  /** Cashes out the round, on the player's request only (W-24). */
  readonly cashOut?: () => void;
  /**
   * "Check again" (W-33, W-35): one read of a round whose cancel is
   * `check-later`, or whose move or cash-out is not confirmed (W-16), which may
   * settle it. It only reads: nothing is sent or signed.
   */
  readonly checkAgain?: () => void;
  readonly retry?: () => void;
  /** Copies a round id (the platform clipboard). */
  readonly copyText?: (text: string) => Promise<void>;
  /** Begins a run of autoplay of `count` rounds at `bet` (W-61, the shell's). */
  readonly autoplay?: (count: number, bet: ShownAmount) => void;
  /** The player's stop of the run (W-61). */
  readonly stopAutoplay?: () => void;
};

/** Autoplay as the bar shows it (W-61): the configured counts, and the run. */
export type AutoplayView = {
  readonly counts: readonly number[];
  /** A run goes: `left` starts are still to come. */
  readonly run?: { readonly left: number };
};

/** The session summary of the menu (RFC-005 section 8), kept in memory. */
export type SessionSummary = {
  /** Whole minutes since the session opened. */
  readonly minutes: number;
  /** Rounds played to their end. */
  readonly rounds: number;
};

export type ViewOptions = {
  readonly intents: Intents;
  /** The environment's `verifyBaseUrl`; no verify link without it. */
  readonly verifyBaseUrl?: string;
  /**
   * The lobby and deposit rules (W-49e), once the operator gate opened (after
   * `welcome`, or standalone); no lobby or deposit control without them.
   */
  readonly links?: LinkRules;
  /**
   * A start or cash-out call is in flight: leaving would end the session before
   * its answer, so no lobby or deposit is offered (W-49f).
   */
  readonly calling?: true;
  /** Autoplay, when the environment configuration turns it on (W-61). */
  readonly autoplay?: AutoplayView;
  /** The session summary, read when the menu opens (RFC-005 section 8). */
  readonly summary?: () => SessionSummary;
};

/**
 * Why the state changed: only a player's own action moves focus (W-46). `pick`
 * is the player's pick in the game frame: like `player`, except that an error
 * it is answered with keeps the focus in the frame while the frame stays
 * playable (W-46, W-58).
 */
export type ChangeCause = "poll" | "player" | "pick";
