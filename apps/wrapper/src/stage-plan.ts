// What the stage shows (W-57) and when the game frame takes input (W-58), as
// pure functions of the UI's state; render.ts applies them. The frame stays
// mounted and in place for the session; it is hidden only in the final states
// (the session ended, another tab, a changed session), where nothing more is
// shown or forwarded to the game. Over it, the overlay is a translucent scrim
// while the round is checked, or an opaque cover in a state in which the
// round cannot be played or the game cannot be shown. W-38's hold is the trust
// measure; `inert` is defense in depth, and the shell's gate still decides
// every pick.

import type { IconName } from "./icons.ts";
import type { MessageKey, Messages } from "./messages.ts";
import { isFinal, type WrapperState } from "./wrapper-state.ts";

/** The stage's cover (W-57): its heading, detail, and how it is announced. */
export type Cover = {
  /** Changes whenever what the cover shows changes. */
  readonly key: string;
  readonly heading: string;
  readonly icon: IconName;
  readonly lines: readonly string[];
  /**
   * The cover owns the page's `role="alert"` region ("as the alert"): its
   * heading is the alert's, and a bar error beside it is plain text.
   */
  readonly alert: boolean;
  /** Its heading takes the focus after the player's own action (W-46). */
  readonly focusOnPlayer: boolean;
};

export type Overlay =
  | { readonly form: "none" }
  /** Translucent: the round is being checked, the game stays visible. */
  | { readonly form: "scrim"; readonly text: string }
  | { readonly form: "cover"; readonly cover: Cover };

export type StagePlan = {
  /** `false` in the final states: the cover takes the frame's place. */
  readonly frameShown: boolean;
  /** The frame takes no input (W-58). */
  readonly inert: boolean;
  readonly overlay: Overlay;
};

const NO_OVERLAY: Overlay = Object.freeze({ form: "none" });

type Texts = {
  readonly heading: MessageKey;
  readonly detail?: MessageKey;
  readonly icon: IconName;
  readonly alert: boolean;
  readonly focusOnPlayer: boolean;
};

/** Each blocking state's cover (W-44, W-57's table). */
const BLOCKING_COVERS: Readonly<
  Record<NonNullable<WrapperState["blocking"]>, Texts>
> = {
  loading: {
    heading: "status.loading",
    icon: "progress",
    alert: false,
    focusOnPlayer: false,
  },
  "configuration-error": {
    heading: "state.configuration",
    detail: "state.configurationDetail",
    icon: "error",
    alert: false,
    focusOnPlayer: false,
  },
  "unsupported-browser": {
    heading: "state.unsupported",
    detail: "state.unsupportedDetail",
    icon: "info",
    alert: false,
    focusOnPlayer: false,
  },
  "session-ended": {
    heading: "state.sessionEnded",
    detail: "state.sessionEndedDetail",
    icon: "info",
    alert: true,
    focusOnPlayer: true,
  },
  "other-tab": {
    heading: "state.otherTab",
    detail: "state.otherTabDetail",
    icon: "info",
    alert: true,
    focusOnPlayer: false,
  },
  // W-53: "this round failed verification", final until a reload.
  "session-changed": {
    heading: "state.verificationFailed",
    detail: "state.sessionChangedDetail",
    icon: "error",
    alert: true,
    focusOnPlayer: false,
  },
  "verification-failed": {
    heading: "state.verificationFailed",
    detail: "state.verificationFailedDetail",
    icon: "error",
    alert: true,
    focusOnPlayer: true,
  },
  "chain-unverified": {
    heading: "state.chainUnverified",
    detail: "state.chainUnverifiedDetail",
    icon: "error",
    alert: true,
    focusOnPlayer: true,
  },
  "out-of-sync": {
    heading: "state.outOfSync",
    detail: "state.outOfSyncDetail",
    icon: "error",
    alert: true,
    focusOnPlayer: true,
  },
  "snapshot-rejected": {
    heading: "state.rejected",
    detail: "state.rejectedDetail",
    icon: "error",
    alert: true,
    focusOnPlayer: true,
  },
};

/** "Game not compatible" (W-38): it follows the game's `hello`, not the player. */
const INCOMPATIBLE: Texts = {
  heading: "error.heading",
  detail: "error.gameIncompatible",
  icon: "error",
  alert: true,
  focusOnPlayer: false,
};

/** An `active` round the shell does not hold (W-42, W-11). */
const NOT_HELD: Texts = {
  heading: "state.notHeld",
  detail: "state.notHeldDetail",
  icon: "info",
  alert: false,
  focusOnPlayer: true,
};

/**
 * A changed book round (W-52) whose result is shown: the bar gives the result
 * with the failure beside it, and the cover takes the game's place (W-55).
 */
const CHANGED_RESULT: Texts = {
  heading: "state.verificationFailed",
  icon: "error",
  alert: false,
  focusOnPlayer: false,
};

/** A book round's result whose `playback` copy failed closed (W-38, W-55). */
const COPY_FAILED: Texts = {
  heading: "notice.gameCantShow",
  icon: "info",
  alert: false,
  focusOnPlayer: false,
};

const coverOf = (m: Messages, key: string, texts: Texts): Overlay => ({
  form: "cover",
  cover: {
    key,
    heading: m[texts.heading],
    icon: texts.icon,
    lines: texts.detail === undefined ? [] : [m[texts.detail]],
    alert: texts.alert,
    focusOnPlayer: texts.focusOnPlayer,
  },
});

/**
 * Whether a book round's result is shown with the game playing it back (W-55):
 * `won` or `lost`, in no blocking state, not a changed round (W-52: the shell's
 * verdict failed).
 */
const showsPlayback = (state: WrapperState): boolean => {
  const { snapshot, check } = state;
  return (
    state.blocking === undefined &&
    snapshot?.presentation === "playback" &&
    (snapshot.status === "won" || snapshot.status === "lost") &&
    (check === undefined || check.verdict === "ready")
  );
};

/** The overlay the state calls for (W-57's table). */
const overlayOf = (m: Messages, state: WrapperState): Overlay => {
  const { blocking, snapshot, check } = state;
  // "Game not compatible" follows the game's `hello`, which may come before
  // the session's first Snapshot: it replaces the loading cover.
  if (
    state.gameIncompatible === true &&
    (blocking === undefined || blocking === "loading")
  ) {
    return coverOf(m, "game-incompatible", INCOMPATIBLE);
  }
  if (blocking !== undefined) {
    return coverOf(m, blocking, BLOCKING_COVERS[blocking]);
  }
  if (snapshot?.status === "active" && check === undefined) {
    return coverOf(m, "not-held", NOT_HELD);
  }
  if (showsPlayback(state) && state.gameCopyFailed === true) {
    return coverOf(m, "copy-failed", COPY_FAILED);
  }
  if (
    snapshot?.presentation === "playback" &&
    check !== undefined &&
    check.verdict !== "ready" &&
    check.verdict !== "checking"
  ) {
    return coverOf(m, "changed-result", CHANGED_RESULT);
  }
  if (snapshot?.status === "active" && check?.verdict === "checking") {
    return { form: "scrim", text: m["detail.verifying"] };
  }
  return NO_OVERLAY;
};

/**
 * Whether the frame takes input (W-58): only at `active`, in a round the shell
 * holds with the verdict `ready`, and none of W-58's conditions: a blocking
 * state, out of sync, a move or cash-out not confirmed, a cash-out call in
 * flight (`calling`: no start can be in flight at `active`), the shell's cancel
 * in any state but `none`, or "game not compatible". A connection problem, a
 * typed error, the generic error, the slow notice, the development indicator, a
 * move in flight, and a pending move leave it interactive.
 */
export const playable = (state: WrapperState, calling: boolean): boolean => {
  const { snapshot, check } = state;
  return (
    state.blocking === undefined &&
    state.gameIncompatible !== true &&
    !calling &&
    snapshot?.status === "active" &&
    check !== undefined &&
    check.verdict === "ready" &&
    !check.outOfSync &&
    check.unconfirmed === undefined &&
    check.cancel === "none"
  );
};

/** The stage for `state` (W-57, W-58). */
export const stagePlan = (
  m: Messages,
  state: WrapperState,
  calling: boolean,
): StagePlan => ({
  // A final state shows nothing more of the game (W-53, W-7, W-14).
  frameShown: !isFinal(state),
  inert: !playable(state, calling),
  overlay: overlayOf(m, state),
});
