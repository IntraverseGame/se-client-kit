// T-46, the menu's entry (W-64): "Link a wallet" shows only when the shell
// offers it (a notice and a signing page, the session open, no window open or
// delegation registered, not a book game, no round or cancel open) and both
// `(pointer: fine)` and `(hover: hover)` match, read when the menu opens; each
// condition false hides it (absent, not disabled). While the window is open
// the item reads "Signing window open" and focuses that window; once
// registered, the menu shows the line "Wallet linked for this session" with
// the wallet shortened, as text.

import type { DelegationOffer } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import {
  buttonIn,
  consentDialog,
  delegationUi,
  openMenu,
} from "./fixtures/delegation-ui.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const LINK = m["delegation.link"];

const WALLET = "0x1234567890abcdef1234567890abcdef1234abcd";

describe("the menu's wallet entry (T-46, W-64)", () => {
  it('offers "Link a wallet" when the shell offers it and both media queries match', async () => {
    const ui = await delegationUi();
    const panel = openMenu(ui.host);
    expect(buttonIn(panel, LINK)).toBeDefined();
    expect(ui.queries).toEqual(
      expect.arrayContaining(["(pointer: fine)", "(hover: hover)"]),
    );
  });

  it.each<[string, DelegationOffer]>([
    ["no notice", { kind: "not-offered", reason: "no-notice" }],
    ["no signing page", { kind: "not-offered", reason: "not-configured" }],
    ["the session ended", { kind: "not-offered", reason: "ended" }],
    ["a book game", { kind: "not-offered", reason: "book" }],
    [
      "an open round or a cancel in progress",
      { kind: "not-offered", reason: "round-open" },
    ],
  ])("is absent when the shell does not offer it: %s", async (_name, offer) => {
    const ui = await delegationUi({ offer });
    const panel = openMenu(ui.host);
    expect(buttonIn(panel, LINK)).toBeUndefined();
    expect(panel.textContent).not.toContain(LINK);
  });

  it.each([["(pointer: fine)"], ["(hover: hover)"]])(
    "is absent when %s does not match",
    async query => {
      const ui = await delegationUi({ matches: q => q !== query });
      expect(buttonIn(openMenu(ui.host), LINK)).toBeUndefined();
    },
  );

  it("reads the media queries when the menu opens", async () => {
    let fine = false;
    const ui = await delegationUi({ matches: () => fine });
    const button = ui.host.querySelector<HTMLButtonElement>(".se-menu-button");
    expect(buttonIn(openMenu(ui.host), LINK)).toBeUndefined();
    button?.click();
    fine = true;
    expect(buttonIn(openMenu(ui.host), LINK)).toBeDefined();
  });

  it("is absent with no signing page configured: no delegation is wired", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
    });
    const panel = openMenu(ui.host);
    expect(panel.querySelectorAll("button")).toHaveLength(0);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("closes the menu and opens the consent dialog when chosen", async () => {
    const ui = await delegationUi();
    buttonIn(openMenu(ui.host), LINK)?.click();
    expect(
      ui.host.querySelector(".se-menu .se-popover")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(consentDialog().open).toBe(true);
  });

  it('reads "Signing window open" while signing, and focuses that window', async () => {
    const ui = await delegationUi();
    buttonIn(openMenu(ui.host), LINK)?.click();
    buttonIn(consentDialog(), m["delegation.confirm"])?.click();
    const panel = openMenu(ui.host);
    expect(buttonIn(panel, LINK)).toBeUndefined();
    const open = buttonIn(panel, m["delegation.signingOpen"]);
    expect(open).toBeDefined();
    open?.click();
    expect(ui.handle.focused()).toBe(1);
    // One window at a time: no second window was opened.
    expect(ui.opened).toHaveLength(1);
  });

  it("shows the linked wallet, shortened, as text, once registered", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "registered", wallet: WALLET });
    const panel = openMenu(ui.host);
    expect(buttonIn(panel, LINK)).toBeUndefined();
    const line = panel.querySelector(".se-wallet");
    expect(line?.textContent).toBe(
      `${m["delegation.linkedLine"]} 0x1234\u2026abcd`,
    );
    expect(line?.querySelector("button, a")).toBeNull();
  });

  it('reads "Signing window open" whatever the media queries say (decided 2026-11-21)', async () => {
    let desktop = true;
    const ui = await delegationUi({ matches: () => desktop });
    buttonIn(openMenu(ui.host), LINK)?.click();
    buttonIn(consentDialog(), m["delegation.confirm"])?.click();
    desktop = false;
    const open = buttonIn(openMenu(ui.host), m["delegation.signingOpen"]);
    expect(open).toBeDefined();
    open?.click();
    expect(ui.handle.focused()).toBe(1);
  });

  it("shows the linked line whatever the media queries say (decided 2026-11-21)", async () => {
    const ui = await delegationUi({ matches: () => false });
    ui.fake.delegation.set({ state: "registered", wallet: WALLET });
    expect(openMenu(ui.host).querySelector(".se-wallet")?.textContent).toBe(
      `${m["delegation.linkedLine"]} 0x1234\u2026abcd`,
    );
  });

  it("offers the entry again after a decline or a failure, but not after the session ended", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "declined" });
    expect(buttonIn(openMenu(ui.host), LINK)).toBeDefined();
    ui.fake.delegation.set({ state: "failed", reason: "no-wallet" });
    expect(buttonIn(openMenu(ui.host), LINK)).toBeDefined();
    ui.fake.delegation.setOffer({ kind: "not-offered", reason: "ended" });
    ui.fake.delegation.set({ state: "failed", reason: "session-ended" });
    expect(buttonIn(openMenu(ui.host), LINK)).toBeUndefined();
  });
});
