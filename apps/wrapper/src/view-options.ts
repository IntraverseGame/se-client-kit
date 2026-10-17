// What the UI is given besides its state: the player intents that are wired,
// and the environment's verify base.

import type { ShownAmount } from "./round-input.ts";

/**
 * What the player can ask for. A control is shown only when its intent is
 * wired: the start, cash-out, and new-round intents come from the session.
 */
export type Intents = {
  readonly start?: (bet: ShownAmount) => void;
  /** Cashes out the round, on the player's request only (W-24). */
  readonly cashOut?: () => void;
  readonly newRound?: () => void;
  readonly retry?: () => void;
  /** Copies a round id (the platform clipboard). */
  readonly copyText?: (text: string) => Promise<void>;
};

export type ViewOptions = {
  readonly intents: Intents;
  /** The environment's `verifyBaseUrl`; no verify link without it. */
  readonly verifyBaseUrl?: string;
};

/** Why the state changed: only a player's own action moves focus (W-46). */
export type ChangeCause = "poll" | "player";
