// When the game frame is shown (W-31, W-37, W-55), and when the notice "The
// game can't show this round." shows in its place (W-38, W-55). Pure functions
// of the UI's state; render.ts applies them.

import type { WrapperState } from "./wrapper-state.ts";

/**
 * Whether a book round's result is shown with the game beside it (W-55): `won`
 * or `lost`, in no blocking state, not a changed round (W-52: the shell's
 * verdict failed), and only when the game could be sent the Snapshot's
 * `playback` copy. The game stays with the result until the player starts the
 * next round, whose Snapshot (`starting`) hides it.
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

/**
 * Whether the game is shown: `active` once the shell's checks passed, or
 * `resolving` (W-31); a book round's result while its copy was sent (W-55).
 */
export const showsGame = (state: WrapperState): boolean => {
  const status = state.snapshot?.status;
  if (state.snapshot?.presentation === "playback") {
    return showsPlayback(state) && state.gameCopyFailed !== true;
  }
  return (
    state.blocking === undefined &&
    state.check?.verdict === "ready" &&
    (status === "active" || status === "resolving")
  );
};

/**
 * Whether "The game can't show this round." shows in place of the frame: a book
 * round's result whose `playback` copy failed closed (W-38, W-55).
 */
export const showsCopyNotice = (state: WrapperState): boolean =>
  showsPlayback(state) && state.gameCopyFailed === true;
