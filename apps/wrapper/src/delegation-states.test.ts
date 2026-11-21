// T-46, what the player is told of each delegation state (W-69, W-46):
// `offered`, `signing`, and `declined` show nothing; `registered` is announced
// politely; `failed` shows its reason's label, then "You can play on without a
// wallet.", in the bar's alert line, never with a code or an address, and is
// dismissed by the player's next action (a start, the menu); `session-ended`
// shows no failure of its own. No state change of the delegation moves the
// focus.

import type { DelegationFailureReason } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { alertText, allText, buttonNamed, liveText } from "./fixtures/app.ts";
import { delegationUi, openMenu } from "./fixtures/delegation-ui.ts";
import { snapshotRead } from "./fixtures/fake-session.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const WALLET = "0x1234567890abcdef1234567890abcdef1234abcd";

const FAILURES: readonly (readonly [
  Exclude<DelegationFailureReason, "session-ended">,
  string,
])[] = [
  ["blocked", "The signing window could not connect. Close it if it opened."],
  ["no-ready", "The signing window could not connect. Close it if it opened."],
  ["no-wallet", "No browser wallet was found."],
  ["rejected", "You declined the signature in your wallet."],
  ["unknown-notice", "The signing window could not use this request."],
  ["invalid-request", "The signing window could not use this request."],
  ["wallet-error", "Your wallet reported an error."],
  [
    "wallet-mismatch",
    "The signature did not come from the wallet that was named.",
  ],
];

describe("what each delegation state shows (T-46, W-69)", () => {
  it.each([["offered"], ["signing"], ["declined"]] as const)(
    "%s shows nothing in the alert line",
    async state => {
      const ui = await delegationUi();
      ui.fake.delegation.set({ state });
      expect(alertText(ui.host)).toBe("");
    },
  );

  it("announces a registration politely, and shows no alert", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "registered", wallet: WALLET });
    expect(liveText(ui.host)).toBe(m["delegation.linked"]);
    expect(alertText(ui.host)).toBe("");
    // The address is shown only in the menu's line, shortened.
    expect(allText(ui.host)).not.toContain(WALLET);
  });

  it.each(FAILURES)(
    "failed with %s shows its label, then that play goes on",
    async (reason, label) => {
      const ui = await delegationUi();
      ui.fake.delegation.set({ state: "failed", reason });
      expect(m[`delegation.failed.${reason}`]).toBe(label);
      expect(alertText(ui.host)).toBe(
        `${m["error.heading"]}${label}${m["delegation.playOn"]}`,
      );
      expect(allText(ui.host)).not.toContain(reason);
      expect(
        ui.host.querySelector('[role="alert"]')?.querySelector("button"),
      ).toBeNull();
    },
  );

  it("shows no failure of its own when the session ended", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "failed", reason: "session-ended" });
    expect(alertText(ui.host)).toBe("");
  });

  it("dismisses a failure when the player opens the menu", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "failed", reason: "no-wallet" });
    openMenu(ui.host);
    expect(alertText(ui.host)).toBe("");
  });

  it("dismisses a failure when the player starts a round", async () => {
    const ui = await delegationUi({
      prepare: fake => {
        fake.answerStart(snapshotRead("coinflip-starting"));
      },
    });
    ui.fake.delegation.set({ state: "failed", reason: "rejected" });
    buttonNamed(ui.host, m["action.placeBet"])?.click();
    expect(alertText(ui.host)).toBe("");
    await ui.settle();
    expect(alertText(ui.host)).toBe("");
  });

  it("ranks the alert line: a typed error over a failure, a failure over a connection problem, a refusal over both", async () => {
    const ui = await delegationUi();
    ui.fake.delegation.set({ state: "failed", reason: "no-wallet" });
    ui.app.accept(
      {
        kind: "problem",
        problem: { code: "UNAVAILABLE", retryable: false, requestId: "req_1" },
      },
      "poll",
    );
    expect(alertText(ui.host)).toContain(m["error.UNAVAILABLE"]);
    expect(alertText(ui.host)).not.toContain(m["delegation.failed.no-wallet"]);
    ui.app.dismissProblem();
    ui.app.accept({ kind: "network" }, "poll");
    expect(alertText(ui.host)).toBe(
      `${m["error.heading"]}${m["delegation.failed.no-wallet"]}${m["delegation.playOn"]}`,
    );
    ui.fake.delegation.set({
      state: "refused",
      code: "KEY_DELEGATION_EXPIRED",
    });
    expect(alertText(ui.host)).toContain(m["error.keyDelegationRefused"]);
    expect(alertText(ui.host)).toContain(m["error.KEY_DELEGATION_EXPIRED"]);
    expect(alertText(ui.host)).not.toContain(m["state.connection"]);
  });

  it("moves no focus for a state change", async () => {
    const ui = await delegationUi();
    const focused = document.activeElement;
    for (const state of [
      { state: "signing" },
      { state: "failed", reason: "wallet-error" },
      { state: "registered", wallet: WALLET },
      { state: "refused", code: "KEY_DELEGATION_EXPIRED" },
      { state: "offered" },
    ] as const) {
      ui.fake.delegation.set(state);
      expect(document.activeElement).toBe(focused);
    }
  });
});
