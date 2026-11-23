// The consent dialog of the wallet delegation (W-65): the Wrapper's one modal
// dialog, an HTML `<dialog>` opened with `showModal()`, so the rest of the
// page, the game frame included, is inert while it is open. It explains, in
// the session's language, what the player signs and what it allows, then
// shows the notice's exact English text, as text in a block of its own (marked
// "Pending legal review" while the notice is `pending`), and offers "Open the
// signing window" and "Not now". It is labelled by its heading and described
// by its first paragraph; opening it moves the focus to the heading (focusable
// by script only), so the explanation is read before any control; the notice's
// block is a tab stop only while it scrolls, checked again on each of its size
// changes while the dialog is open; Escape is "Not now"; closing it,
// by either control or by Escape, hands the focus back (to the menu's button).
// The look is the Wrapper's one dark theme until a designed dialog replaces it
// (se-client-kit#256).

import type { DelegationNotice } from "@intraverse/se-client-shell";

import { markOverflow } from "./bar-slots.ts";
import { button, elementBuilder } from "./dom.ts";
import type { Messages } from "./messages.ts";

export const DIALOG_HEADING_ID = "se-dialog-heading";
const DIALOG_INTRO_ID = "se-dialog-intro";
const NOTICE_LABEL_ID = "se-dialog-notice-label";
const PENDING_ID = "se-dialog-pending";

export type ConsentDialogArgs = {
  readonly m: Messages;
  /** The language of `m`, for the dialog's `lang` (the notice is `en`). */
  readonly language: string;
  readonly notice: DelegationNotice;
  /** "Open the signing window", called after the dialog closed (W-66). */
  readonly onConfirm: () => void;
  /** The dialog closed, by either control or by Escape. */
  readonly onClose: () => void;
};

export type ConsentDialog = {
  readonly element: HTMLDialogElement;
  readonly open: (args: ConsentDialogArgs) => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
};

export const createConsentDialog = (doc: Document): ConsentDialog => {
  const el = elementBuilder(doc);
  const dialog = el("dialog", {
    class: "se-dialog",
    "aria-labelledby": DIALOG_HEADING_ID,
    "aria-describedby": DIALOG_INTRO_ID,
  });
  let onClose: (() => void) | undefined;
  // The notice block's size watch while the dialog is open.
  let watch: ResizeObserver | undefined;
  const close = (): void => {
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener("close", () => {
    watch?.disconnect();
    watch = undefined;
    const closed = onClose;
    onClose = undefined;
    closed?.();
  });
  // Escape is "Not now" (W-65), whatever the platform's own close request.
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });

  const open = (args: ConsentDialogArgs): void => {
    if (dialog.open) return;
    const { m, notice } = args;
    const pending = notice.status === "pending";
    const heading = el(
      "h2",
      { id: DIALOG_HEADING_ID, class: "se-dialog__title", tabindex: "-1" },
      [m["delegation.heading"]],
    );
    // The signed bytes: text only, never markup, whitespace and case kept.
    const block = el(
      "div",
      {
        class: "se-dialog__notice",
        lang: "en",
        role: "region",
        "aria-labelledby": pending
          ? `${NOTICE_LABEL_ID} ${PENDING_ID}`
          : NOTICE_LABEL_ID,
      },
      [notice.text],
    );
    const confirm = button(
      el,
      m["delegation.confirm"],
      "dialog-confirm",
      () => {
        // Closed first; then the window opens under the same click (W-66).
        close();
        args.onConfirm();
      },
    );
    confirm.classList.add("se-button--primary");
    dialog.setAttribute("lang", args.language);
    dialog.replaceChildren(
      heading,
      el("p", { id: DIALOG_INTRO_ID }, [m["delegation.whatItSigns"]]),
      el("p", {}, [m["delegation.public"]]),
      el("p", {}, [m["delegation.eachSession"]]),
      el("p", {}, [m["delegation.window"]]),
      el("p", { id: NOTICE_LABEL_ID, class: "se-dialog__label" }, [
        m["delegation.noticeIntro"],
      ]),
      ...(pending
        ? [
            el("p", { id: PENDING_ID, class: "se-dialog__pending" }, [
              m["delegation.pending"],
            ]),
          ]
        : []),
      block,
      el("div", { class: "se-dialog__actions" }, [
        confirm,
        button(el, m["delegation.notNow"], "dialog-not-now", close),
      ]),
    );
    onClose = args.onClose;
    dialog.showModal();
    markOverflow(block);
    // A width, zoom, or text-size change can make the block scroll, or stop
    // it, while the dialog is open: its tab stop follows (as bar-slots.ts's).
    const Observer = doc.defaultView?.ResizeObserver;
    if (Observer !== undefined) {
      watch = new Observer(() => {
        markOverflow(block);
      });
      watch.observe(block);
    }
    heading.focus();
  };

  return Object.freeze({
    element: dialog,
    open,
    close,
    isOpen: (): boolean => dialog.open,
  });
};
