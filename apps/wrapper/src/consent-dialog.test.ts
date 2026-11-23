// T-46, the consent dialog (W-65, W-46): a modal `<dialog>`, labelled by its
// heading and described by its first paragraph, in the session's language;
// its texts; the notice's exact English text as text, whitespace and case
// kept, marked "Pending legal review" while `pending` and unmarked once
// `approved`; the focus on its heading when it opens; "Not now" and Escape
// closing it and returning the focus to the menu's button. The axe audit of
// the open dialog is the browser's (e2e/tests/t50-delegation.spec.ts).

import type { DelegationNotice } from "@intraverse/se-client-shell";
import { describe, expect, it, vi } from "vitest";

import {
  buttonIn,
  consentDialog,
  delegationUi,
  menuButton,
  openMenu,
} from "./fixtures/delegation-ui.ts";
import { PENDING_NOTICE } from "./fixtures/fake-delegation.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

const APPROVED: DelegationNotice = {
  id: "en-1",
  text: "An <b>approved</b> notice &amp; its text.",
  status: "approved",
};

/** The UI with the dialog opened from the menu, as the player opens it. */
const opened = async (notice: DelegationNotice = PENDING_NOTICE) => {
  const ui = await delegationUi({ offer: { kind: "offered", notice } });
  buttonIn(openMenu(ui.host), m["delegation.link"])?.click();
  return { ui, dialog: consentDialog() };
};

describe("the consent dialog (T-46, W-65)", () => {
  it("is a modal dialog labelled by its heading and described by its first paragraph", async () => {
    const { dialog } = await opened();
    expect(dialog.open).toBe(true);
    const labelledBy = String(dialog.getAttribute("aria-labelledby"));
    const describedBy = String(dialog.getAttribute("aria-describedby"));
    const heading = dialog.querySelector(`#${labelledBy}`);
    expect(heading?.tagName).toBe("H2");
    expect(heading?.textContent).toBe(m["delegation.heading"]);
    expect(dialog.querySelector(`#${describedBy}`)?.textContent).toBe(
      m["delegation.whatItSigns"],
    );
    expect(dialog.getAttribute("lang")).toBe("en");
  });

  it("explains what is signed, then shows the notice, then the two controls, in order", async () => {
    const { dialog } = await opened();
    const texts = [...dialog.children].map(child => child.textContent);
    expect(texts).toEqual([
      m["delegation.heading"],
      m["delegation.whatItSigns"],
      m["delegation.public"],
      m["delegation.eachSession"],
      m["delegation.window"],
      m["delegation.noticeIntro"],
      m["delegation.pending"],
      PENDING_NOTICE.text,
      `${m["delegation.confirm"]}${m["delegation.notNow"]}`,
    ]);
  });

  it("shows the notice's text exactly, as text in English, and marks a pending one", async () => {
    const { dialog } = await opened();
    const block = dialog.querySelector(".se-dialog__notice");
    expect(block?.textContent).toBe(PENDING_NOTICE.text);
    expect(block?.childNodes).toHaveLength(1);
    expect(block?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(block?.getAttribute("lang")).toBe("en");
    expect(dialog.querySelector(".se-dialog__pending")?.textContent).toBe(
      m["delegation.pending"],
    );
    expect(block?.getAttribute("aria-labelledby")?.split(" ")).toHaveLength(2);
  });

  it("does not mark an approved notice, and never reads its text as markup", async () => {
    const { dialog } = await opened(APPROVED);
    expect(dialog.querySelector(".se-dialog__pending")).toBeNull();
    expect(dialog.textContent).not.toContain(m["delegation.pending"]);
    const block = dialog.querySelector(".se-dialog__notice");
    expect(block?.textContent).toBe(APPROVED.text);
    expect(block?.querySelector("b")).toBeNull();
  });

  it("moves the focus to its heading, focusable by script only", async () => {
    const { dialog } = await opened();
    const heading = dialog.querySelector("h2");
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps the notice's block out of the tab order while it does not scroll", async () => {
    const { dialog } = await opened();
    // jsdom lays nothing out, so the block never overflows here; the browser
    // case is e2e's.
    expect(
      dialog.querySelector(".se-dialog__notice")?.hasAttribute("tabindex"),
    ).toBe(false);
  });

  it("marks the notice's block a tab stop again on each size change while open", async () => {
    const observers: FakeObserver[] = [];
    class FakeObserver {
      readonly targets: Element[] = [];
      readonly callback: () => void;
      disconnected = false;
      constructor(callback: () => void) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target: Element): void {
        this.targets.push(target);
      }
      disconnect(): void {
        this.disconnected = true;
      }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const { dialog } = await opened();
    vi.unstubAllGlobals();
    const block = dialog.querySelector<HTMLElement>(".se-dialog__notice");
    const [observer] = observers;
    expect(observer?.targets).toEqual([block]);
    expect(block?.hasAttribute("tabindex")).toBe(false);
    // The block now scrolls: a zoom, or a narrower window.
    Object.defineProperty(block, "scrollHeight", { value: 400 });
    Object.defineProperty(block, "clientHeight", { value: 200 });
    observer?.callback();
    expect(block?.getAttribute("tabindex")).toBe("0");
    buttonIn(dialog, m["delegation.notNow"])?.click();
    expect(observer?.disconnected).toBe(true);
  });

  it('closes on "Not now" and returns the focus to the menu\'s button, opening nothing', async () => {
    const { ui, dialog } = await opened();
    buttonIn(dialog, m["delegation.notNow"])?.click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(menuButton(ui.host));
    expect(ui.opened).toHaveLength(0);
    expect(ui.fake.delegation.begun).toHaveLength(0);
  });

  it('closes on Escape, as "Not now", and returns the focus to the menu\'s button', async () => {
    const { ui, dialog } = await opened();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    dialog.querySelector("h2")?.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(menuButton(ui.host));
    expect(ui.opened).toHaveLength(0);
  });

  it("follows the session's language, with English as the fallback", async () => {
    const { dialog } = await opened();
    // The vectors' sessions are English; a language with no catalogue falls
    // back to it (W-48), and the dialog names the language it shows.
    expect(dialog.getAttribute("lang")).toBe(messagesFor("xx").language);
  });

  it("is closed when the session ends", async () => {
    const { ui, dialog } = await opened();
    ui.fake.endNow();
    expect(dialog.open).toBe(false);
  });
});
