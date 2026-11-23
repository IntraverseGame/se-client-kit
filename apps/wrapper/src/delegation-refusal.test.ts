// T-46, a refused delegated start (W-71, W-46): the alert follows the shell's
// `refused` state, never the problem's code: "Your wallet link was refused,
// and the round did not start." and the code's label, with "Sign again" (the
// consent dialog) and "Continue without" (the delegation dropped, the error
// set aside), the start control disabled until the player chooses, and the
// alert's heading taking the focus as a start's error does. A "Sign again"
// attempt holds the start too, and one that fails shows its own label first,
// then the refusal again. Any other refusal of a delegated start offers
// "Continue without a wallet" beside it.

import type {
  DelegationRefusalCode,
  SessionRead,
  ValidPlayProblem,
} from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { alertText, buttonNamed } from "./fixtures/app.ts";
import {
  buttonIn,
  consentDialog,
  delegationUi,
} from "./fixtures/delegation-ui.ts";
import type { FakeSession } from "./fixtures/fake-session.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const WALLET = "0x1234567890abcdef1234567890abcdef1234abcd";
const REQUEST_ID = "req_01JKD3";

const problem = (code: string, status = 422): SessionRead => ({
  kind: "problem",
  problem: {
    type: "about:blank",
    title: code,
    status,
    code,
    retryable: false,
    requestId: REQUEST_ID,
  } as ValidPlayProblem,
});

/**
 * A registered session whose next start is answered `answer`, the shell setting
 * the state to `refused` with `refusal` when one is given.
 */
const refusedBy = async (
  answer: SessionRead,
  refusal?: DelegationRefusalCode,
) => {
  const ui = await delegationUi({
    prepare: (fake: FakeSession) => {
      fake.answerStart(answer);
      fake.onStart(() => {
        refuse(fake, refusal);
      });
    },
  });
  ui.fake.delegation.set({ state: "registered", wallet: WALLET });
  buttonNamed(ui.host, m["action.placeBet"])?.click();
  await ui.settle();
  return ui;
};

const refuse = (fake: FakeSession, code?: DelegationRefusalCode): void => {
  if (code === undefined) return;
  fake.delegation.set({ state: "refused", code });
};

const startDisabled = (host: HTMLElement): boolean | undefined =>
  host.querySelector<HTMLButtonElement>("button.se-start")?.disabled;

const alertRegion = (host: HTMLElement): HTMLElement =>
  host.querySelector<HTMLElement>('[role="alert"]') ?? host;

const CODES: readonly DelegationRefusalCode[] = [
  "KEY_DELEGATION_INVALID",
  "KEY_DELEGATION_EXPIRED",
  "KEY_DELEGATION_NOTICE_UNKNOWN",
];

describe("a 422 KEY_DELEGATION_* refusal (T-46, W-71)", () => {
  it.each(CODES)(
    "%s: the refusal, its label, its two controls, and the start held",
    async code => {
      const ui = await refusedBy(problem(code), code);
      expect(alertText(ui.host)).toBe(
        `${m["error.heading"]}${m["error.keyDelegationRefused"]}${m[`error.${code}`]}${m["label.requestId"]} ${REQUEST_ID}${m["delegation.signAgain"]}${m["delegation.continueWithout"]}`,
      );
      expect(alertText(ui.host)).not.toContain(code);
      expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
      expect(startDisabled(ui.host)).toBe(true);
      // The player's own start: the error heading takes the focus (W-46).
      expect(document.activeElement?.closest('[role="alert"]')).not.toBeNull();
    },
  );

  it('"Sign again" opens the consent dialog, and the start stays held', async () => {
    const ui = await refusedBy(
      problem("KEY_DELEGATION_INVALID"),
      "KEY_DELEGATION_INVALID",
    );
    buttonIn(alertRegion(ui.host), m["delegation.signAgain"])?.click();
    expect(consentDialog().open).toBe(true);
    buttonIn(consentDialog(), m["delegation.confirm"])?.click();
    expect(ui.fake.delegation.begun).toEqual([ui.handle]);
    // The attempt is open: the start stays held, "Continue without" stays.
    expect(startDisabled(ui.host)).toBe(true);
    expect(
      buttonIn(alertRegion(ui.host), m["delegation.continueWithout"]),
    ).toBeDefined();
    expect(
      buttonIn(alertRegion(ui.host), m["delegation.signAgain"]),
    ).toBeUndefined();
    ui.fake.delegation.set({ state: "registered", wallet: WALLET });
    expect(startDisabled(ui.host)).toBe(false);
    expect(alertText(ui.host)).not.toContain(m["error.keyDelegationRefused"]);
  });

  it('a failed "Sign again" shows its own label first, then the refusal again', async () => {
    const ui = await refusedBy(
      problem("KEY_DELEGATION_EXPIRED"),
      "KEY_DELEGATION_EXPIRED",
    );
    buttonIn(alertRegion(ui.host), m["delegation.signAgain"])?.click();
    buttonIn(consentDialog(), m["delegation.confirm"])?.click();
    ui.fake.delegation.set({ state: "failed", reason: "rejected" });
    ui.fake.delegation.set({
      state: "refused",
      code: "KEY_DELEGATION_EXPIRED",
    });
    expect(alertText(ui.host)).toContain(
      `${m["delegation.failed.rejected"]}${m["error.keyDelegationRefused"]}${m["error.KEY_DELEGATION_EXPIRED"]}`,
    );
    expect(startDisabled(ui.host)).toBe(true);
  });

  it('"Continue without" drops the delegation, sets the error aside, and frees the start', async () => {
    const ui = await refusedBy(
      problem("KEY_DELEGATION_INVALID"),
      "KEY_DELEGATION_INVALID",
    );
    buttonIn(alertRegion(ui.host), m["delegation.continueWithout"])?.click();
    expect(ui.fake.delegation.drops()).toBe(1);
    expect(ui.fake.delegation.members.delegation()).toEqual({
      state: "offered",
    });
    expect(alertText(ui.host)).toBe("");
    expect(startDisabled(ui.host)).toBe(false);
  });

  it('"Continue without" during a "Sign again" attempt frees the start', async () => {
    const ui = await refusedBy(
      problem("KEY_DELEGATION_INVALID"),
      "KEY_DELEGATION_INVALID",
    );
    buttonIn(alertRegion(ui.host), m["delegation.signAgain"])?.click();
    buttonIn(consentDialog(), m["delegation.confirm"])?.click();
    buttonIn(alertRegion(ui.host), m["delegation.continueWithout"])?.click();
    expect(ui.fake.delegation.drops()).toBe(1);
    expect(startDisabled(ui.host)).toBe(false);
    expect(alertText(ui.host)).toBe("");
  });

  it("follows the state, not the code: the same code with no refusal is any other refusal", async () => {
    const ui = await refusedBy(problem("KEY_DELEGATION_INVALID", 400));
    expect(alertText(ui.host)).not.toContain(m["error.keyDelegationRefused"]);
    expect(alertText(ui.host)).toContain(m["error.KEY_DELEGATION_INVALID"]);
    expect(startDisabled(ui.host)).toBe(false);
    expect(
      buttonIn(alertRegion(ui.host), m["delegation.continueWithoutWallet"]),
    ).toBeDefined();
  });
});

describe("any other refusal of a delegated start (T-46, W-71)", () => {
  it('is shown as today, with "Continue without a wallet", which drops the delegation', async () => {
    const ui = await refusedBy(problem("INVALID_ARGUMENT", 400));
    expect(alertText(ui.host)).toBe(
      `${m["error.heading"]}${m["error.generic"]}${m["label.requestId"]} ${REQUEST_ID}${m["delegation.continueWithoutWallet"]}`,
    );
    expect(startDisabled(ui.host)).toBe(false);
    buttonIn(
      alertRegion(ui.host),
      m["delegation.continueWithoutWallet"],
    )?.click();
    expect(ui.fake.delegation.drops()).toBe(1);
    expect(
      buttonIn(alertRegion(ui.host), m["delegation.continueWithoutWallet"]),
    ).toBeUndefined();
    // The refusal itself stays until the player's next action.
    expect(alertText(ui.host)).toContain(m["error.generic"]);
  });

  it("is not offered after an undelegated start", async () => {
    const ui = await delegationUi({
      prepare: fake => {
        fake.answerStart(problem("INVALID_ARGUMENT", 400));
      },
    });
    buttonNamed(ui.host, m["action.placeBet"])?.click();
    await ui.settle();
    expect(alertText(ui.host)).toContain(m["error.generic"]);
    expect(
      buttonIn(alertRegion(ui.host), m["delegation.continueWithoutWallet"]),
    ).toBeUndefined();
  });
});
