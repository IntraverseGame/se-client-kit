// Where the focus goes after an update of the single screen (W-46, W-57,
// W-58). Only the player's own action moves it to a heading, never a poll,
// with these rules on top: an error answering a pick in a frame that stays
// playable keeps the focus in the frame; a frame that becomes inert while it
// holds the focus hands it to a heading, whatever caused the change, so it is
// never dropped to the body; a bar control that goes away hands it to the
// status heading; and the frame takes it once when the round the player
// started becomes playable.

import type { BarShown } from "./bar-view.ts";
import { roundEnded } from "./round-input.ts";
import type { Cover, StagePlan } from "./stage-plan.ts";
import type { ChangeCause } from "./view-options.ts";
import type { WrapperState } from "./wrapper-state.ts";

export type FocusInput = {
  readonly state: WrapperState;
  readonly cause: ChangeCause;
  readonly plan: StagePlan;
  readonly cover: Cover | undefined;
  readonly coverChanged: boolean;
  readonly coverHeading: HTMLElement | undefined;
  readonly bar: BarShown;
  /** The game's frame held the focus before the update. */
  readonly frameHadFocus: boolean;
  /** The bar's control that held the focus before the update, if any. */
  readonly barControl: HTMLElement | undefined;
  /** The focus fell to the body (or nowhere) during the update. */
  readonly focusDropped: boolean;
};

/** The heading the update calls for, if any (W-46). */
export const focusTarget = (input: FocusInput): HTMLElement | undefined => {
  const { state, cause, plan, cover, bar } = input;
  const { snapshot } = state;
  if (cause !== "poll") {
    // An error answering a pick in a frame that stays playable keeps the
    // focus in the frame.
    const pickKeepsFocus = cause === "pick" && !plan.inert;
    const unconfirmedShown =
      bar.showsRound &&
      snapshot?.status === "active" &&
      state.check?.unconfirmed !== undefined;
    if (
      bar.error !== undefined &&
      bar.alertChanged &&
      cover?.alert !== true &&
      !pickKeepsFocus
    ) {
      return bar.alertHeading;
    }
    if (cover?.focusOnPlayer === true && input.coverChanged) {
      return input.coverHeading;
    }
    if (
      (snapshot !== undefined &&
        bar.showsRound &&
        roundEnded(snapshot, state.check?.cancel)) ||
      (unconfirmedShown && bar.changed)
    ) {
      return bar.statusHeading;
    }
  }
  // The inert-frame rule.
  if (input.frameHadFocus && plan.inert) {
    return bar.statusHeading ?? input.coverHeading;
  }
  // The removed-control rule.
  if (
    input.barControl !== undefined &&
    !input.barControl.isConnected &&
    input.focusDropped
  ) {
    return bar.statusHeading ?? input.coverHeading;
  }
  return undefined;
};

/** Focuses the frame once when the round the player started is playable. */
export type IntoGame = {
  /** The player asked to start a round. */
  readonly started: () => void;
  /** After an update: focuses `frame` when the rule calls for it. */
  readonly after: (
    doc: Document,
    input: FocusInput,
    frame: HTMLIFrameElement | null,
  ) => void;
};

export const createIntoGame = (): IntoGame => {
  // The player's start is waiting for its round to become playable.
  let awaiting = false;
  return Object.freeze({
    started: (): void => {
      awaiting = true;
    },
    after: (doc, input, frame): void => {
      if (!awaiting) return;
      const { state, cause, plan } = input;
      const { snapshot } = state;
      if (frame !== null && !plan.inert) {
        awaiting = false;
        const active = doc.activeElement;
        if (
          active === null ||
          active === doc.body ||
          active === input.bar.statusHeading
        ) {
          frame.focus();
        }
        return;
      }
      const answeredOtherwise =
        cause !== "poll" &&
        (state.problem !== undefined ||
          (snapshot?.status !== "starting" && snapshot?.status !== "active"));
      if (
        state.blocking !== undefined ||
        (snapshot !== undefined && roundEnded(snapshot, state.check?.cancel)) ||
        answeredOtherwise
      ) {
        awaiting = false;
      }
    },
  });
};
