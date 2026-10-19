// A required cancel that loses to the round's closure (W-25, W-33; se-backend
// b47b286, decided in human review 2026-10-19): the cancel is never honored.
// After the shell's cancel was sent, a round that ends `canceled` with
// `closeReason: "expired"` shows "this round failed verification" and the time
// limit's line, never "and was canceled"; one that ends `won` or `lost` shows
// its result with "this round failed verification; it closed before the
// cancel arrived", the round id, the verify link, and the next bet. A round
// that ended with no cancel of the shell's keeps its own texts. The session is
// a scripted stand-in (fixtures/fake-session.ts); the clock is the manual one.

import type { SessionRead } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import {
  alertText,
  allText,
  buttonNamed,
  linkNamed,
  statusHeading,
} from "./fixtures/app.ts";
import {
  active,
  canceledRead,
  failedWith,
  onCancel,
  roundRead,
} from "./fixtures/cancel.ts";
import { validSnapshot } from "./fixtures/fake-session.ts";
import { activeId, round, type Wired, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/** A later read of the round with the vector `name`'s status and result. */
const closedRead = (name: string): SessionRead =>
  roundRead(
    { ...validSnapshot(name), bet: active.bet, context: active.context },
    2,
  );

const EXPIRED = "coinflip-canceled-expired-no-action";

/** The UI after the shell's cancel was sent, its round read as `read`. */
const afterSentCancel = async (read: SessionRead): Promise<Wired> => {
  const ui = await onCancel("settling");
  ui.fake.setRound(failedWith("sent"));
  ui.fake.reads.length = 0;
  ui.fake.reads.push(read);
  await ui.step(1_000);
  return ui;
};

describe("after the shell's cancel was sent (W-33)", () => {
  it("shows a canceled round the time limit closed as failed verification, never as canceled by the player", async () => {
    const ui = await afterSentCancel(closedRead(EXPIRED));
    expect(statusHeading(ui.host)).toBe(m["status.canceled"]);
    expect(allText(ui.host)).toContain(m["detail.unverified"]);
    expect(allText(ui.host)).toContain(m["detail.expired"]);
    expect(allText(ui.host)).not.toContain(m["detail.canceledUnverified"]);
    expect(allText(ui.host)).not.toContain(m["detail.canceled"]);
    expect(alertText(ui.host)).toBe("");
    expect(buttonNamed(ui.host, m["action.start"])).toBeDefined();
  });

  it("keeps the canceled text when the cancel took", async () => {
    const ui = await afterSentCancel(canceledRead());
    expect(allText(ui.host)).toContain(m["detail.canceledUnverified"]);
    expect(allText(ui.host)).not.toContain(m["detail.unverified"]);
  });

  it.each([
    ["won", "coinflip-won", "status.won"],
    ["lost", "coinflip-lost", "status.lost"],
  ] as const)(
    "shows a %s result with its note, the round id, the verify link, and the next bet",
    async (_, name, heading) => {
      const ui = await afterSentCancel(closedRead(name));
      expect(statusHeading(ui.host)).toBe(m[heading]);
      expect(allText(ui.host)).toContain(m["detail.closedBeforeCancel"]);
      expect(allText(ui.host)).toContain(activeId);
      expect(linkNamed(ui.host, m["action.verify"])).toBeDefined();
      expect(buttonNamed(ui.host, m["action.start"])).toBeDefined();
      expect(alertText(ui.host)).toBe("");
    },
  );
});

describe("a round that ended with no cancel of the shell's", () => {
  it.each(["coinflip-won", "coinflip-lost"])(
    "%s shows no cancel note",
    async name => {
      const ui = await wired(fake => {
        fake.reads.push(closedRead(name));
        fake.setRound(round());
      });
      expect(allText(ui.host)).not.toContain(m["detail.closedBeforeCancel"]);
    },
  );

  it("an expired canceled round keeps its own texts", async () => {
    const ui = await wired(fake => {
      fake.reads.push(closedRead(EXPIRED));
      fake.setRound(round());
    });
    expect(allText(ui.host)).toContain(m["detail.canceled"]);
    expect(allText(ui.host)).toContain(m["detail.expired"]);
    expect(allText(ui.host)).not.toContain(m["detail.unverified"]);
  });
});
