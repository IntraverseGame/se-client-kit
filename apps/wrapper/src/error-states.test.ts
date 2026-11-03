// T-16 and T-17 at the component level, and W-41, W-42, W-44: each row of the
// typed-error table, each degraded state shown distinctly, and "open in
// another tab". The network failure (T-15) is in network-states.test.ts. The
// browser runs (a fake Play API per row, two real tabs) belong to the e2e
// suite.

import { describe, expect, it } from "vitest";

import {
  alertText,
  allText,
  buttonNamed,
  coverHeading,
  linkNamed,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { LOCAL_ORIGIN, localDocument } from "./fixtures/environment.ts";
import { problemVector, snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { ProblemInput } from "./round-input.ts";
import type { BlockingState } from "./wrapper-state.ts";

const m = messagesFor("en").messages;

const problem = (
  code: string,
  retryable: boolean,
  requestId = "req_01J9ZK",
): ProblemInput => ({ code, retryable, requestId });

/** The UI on an idle Snapshot (it carries the lobby and deposit links). */
const idleWith = (read: ProblemInput) => {
  const ui = mount();
  ui.connect();
  ui.app.accept(
    { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
    "poll",
  );
  ui.app.accept({ kind: "problem", problem: read }, "poll");
  return ui;
};

describe("typed errors (W-42, T-16)", () => {
  it("INSUFFICIENT_FUNDS tells the player and offers the deposit link", () => {
    const ui = idleWith(problemVector("problem-insufficient-funds"));
    expect(alertText(ui.host)).toContain(m["error.INSUFFICIENT_FUNDS"]);
    const deposit = linkNamed(ui.host, m["action.deposit"]);
    expect(deposit?.getAttribute("href")).toBe(
      "https://luckybet.example.com/cashier",
    );
    expect(deposit?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
    // The idle view stays beside the error.
    expect(statusHeading(ui.host)).toBe(m["status.idle"]);
  });

  it.each(["LIMIT_EXCEEDED", "PLAYER_RESTRICTED"])(
    "%s tells the player and offers no retry",
    code => {
      const ui = idleWith(problem(code, false));
      expect(alertText(ui.host)).toContain(
        m[`error.${code}` as "error.LIMIT_EXCEEDED"],
      );
      expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
    },
  );

  it.each(["SESSION_EXPIRED", "SESSION_REVOKED", "UNAUTHENTICATED"])(
    "%s shows the session-ended state with the lobby as the way to relaunch",
    code => {
      const ui = idleWith(problem(code, false));
      expect(coverHeading(ui.host)).toBe(m["state.sessionEnded"]);
      expect(
        linkNamed(ui.host, m["action.relaunch"])?.getAttribute("href"),
      ).toBe("https://luckybet.example.com/lobby");
      // Nothing is polled after the session ended.
      ui.app.accept(
        { kind: "snapshot", snapshot: snapshotVector("coinflip-won") },
        "poll",
      );
      expect(coverHeading(ui.host)).toBe(m["state.sessionEnded"]);
    },
  );

  it("STALE_ACTION shows the out-of-sync state with the verify link (W-19)", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-active") },
      "poll",
    );
    ui.app.accept(
      { kind: "problem", problem: problem("STALE_ACTION", false) },
      "poll",
    );
    expect(alertText(ui.host)).toContain(m["state.outOfSync"]);
    expect(linkNamed(ui.host, m["action.verify"])).toBeDefined();
  });

  it("ROUND_ACTIVE resumes from the Snapshot it embeds", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "problem", problem: problemVector("problem-round-active") },
      "poll",
    );
    expect(alertText(ui.host)).toBe("");
    expect(statusHeading(ui.host)).not.toBe(m["status.loading"]);
  });

  it.each([
    "FUNDING_UNCONFIRMED",
    "ENTROPY_UNAVAILABLE",
    "PREPARATION_TIMEOUT",
    "ROUND_VOIDED",
  ])("%s, retryable, ends in its message and a back-to-start control", code => {
    const ui = idleWith(problem(code, true));
    expect(alertText(ui.host)).toContain(
      m[`error.${code}` as "error.ROUND_VOIDED"],
    );
    expect(buttonNamed(ui.host, m["action.backToStart"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
  });

  it("UNAVAILABLE, retryable, ends in its message and a try-again control", () => {
    const ui = idleWith(problem("UNAVAILABLE", true));
    expect(alertText(ui.host)).toContain(m["error.UNAVAILABLE"]);
    expect(buttonNamed(ui.host, m["action.retry"])).toBeDefined();
    expect(buttonNamed(ui.host, m["action.backToStart"])).toBeUndefined();
  });

  it("UNAVAILABLE that says retryable: false offers no try again", () => {
    const ui = idleWith(problemVector("problem-redeem-unavailable"));
    expect(alertText(ui.host)).toContain(m["error.UNAVAILABLE"]);
    expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
  });

  it("any other code shows the generic error with its requestId", () => {
    const ui = idleWith(problemVector("problem-default-code-unknown"));
    expect(alertText(ui.host)).toContain(m["error.generic"]);
    expect(alertText(ui.host)).toContain(`${m["label.requestId"]} req_`);
  });

  it("offers try again for any other code only when it is retryable", () => {
    expect(
      buttonNamed(idleWith(problem("INTERNAL", true)).host, m["action.retry"]),
    ).toBeDefined();
    expect(
      buttonNamed(idleWith(problem("INTERNAL", false)).host, m["action.retry"]),
    ).toBeUndefined();
  });

  it("try again reads the Snapshot and clears the error", async () => {
    const ui = idleWith(problem("UNAVAILABLE", true));
    ui.answers.push({
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-idle"),
    });
    const before = ui.reads();
    buttonNamed(ui.host, m["action.retry"])?.click();
    await ui.settle();
    expect(ui.reads()).toBe(before + 1);
    expect(alertText(ui.host)).toBe("");
  });

  it("back to start reads the Snapshot once, and clears the error", async () => {
    const ui = idleWith(problem("ROUND_VOIDED", true));
    ui.answers.push({
      kind: "snapshot",
      snapshot: snapshotVector("coinflip-idle"),
    });
    const before = ui.reads();
    buttonNamed(ui.host, m["action.backToStart"])?.click();
    await ui.settle();
    expect(ui.reads()).toBe(before + 1);
    expect(alertText(ui.host)).toBe("");
  });

  it("shows the problem's message, never its detail text", () => {
    const ui = idleWith(problemVector("problem-insufficient-funds"));
    expect(allText(ui.host)).not.toContain("Balance below the bet.");
  });
});

describe("Snapshot rejected (W-28)", () => {
  it("shows the generic error state, not the round", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-active") },
      "poll",
    );
    ui.app.accept({ kind: "rejected" }, "poll");
    expect(alertText(ui.host)).toContain(m["state.rejected"]);
    expect(ui.host.querySelector(".se-status")?.childElementCount).toBe(0);
  });
});

describe("degraded states, each distinct (W-44)", () => {
  // A changed session (W-53) is shown as "this round failed verification" by
  // the spec, so it shares that heading; it is tested in book-round.test.ts.
  const HEADINGS: Readonly<
    Record<Exclude<BlockingState, "loading" | "session-changed">, string>
  > = {
    "configuration-error": m["state.configuration"],
    "session-ended": m["state.sessionEnded"],
    "other-tab": m["state.otherTab"],
    "unsupported-browser": m["state.unsupported"],
    "verification-failed": m["state.verificationFailed"],
    "chain-unverified": m["state.chainUnverified"],
    "out-of-sync": m["state.outOfSync"],
    "snapshot-rejected": m["state.rejected"],
  };

  it("gives every blocking state its own heading", () => {
    expect(new Set(Object.values(HEADINGS)).size).toBe(
      Object.keys(HEADINGS).length,
    );
  });

  it.each(Object.entries(HEADINGS))("%s shows its heading", (state, text) => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-active") },
      "poll",
    );
    ui.app.block(state as BlockingState);
    expect(allText(ui.host)).toContain(text);
  });

  it("shows the chain-not-independent indicator for a quorum of 1 (W-26a)", () => {
    const ui = mount(localDocument(), undefined, LOCAL_ORIGIN);
    expect(allText(ui.host)).toContain(m["notice.chainNotIndependent"]);
    expect(allText(mount().host)).not.toContain(
      m["notice.chainNotIndependent"],
    );
  });

  it("shows open in another tab and reads nothing (T-17, W-14)", async () => {
    const ui = mount();
    ui.app.block("other-tab");
    ui.connect();
    await ui.step(10_000);
    expect(coverHeading(ui.host)).toBe(m["state.otherTab"]);
  });

  it("keeps verification failed over a later active Snapshot of the round", () => {
    const ui = mount();
    const starting = snapshotVector("coinflip-starting");
    ui.app.accept({ kind: "snapshot", snapshot: starting }, "poll");
    ui.app.block("verification-failed");
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-active") },
      "poll",
    );
    expect(alertText(ui.host)).toContain(m["state.verificationFailed"]);
    expect(allText(ui.host)).not.toContain(m["status.active"]);
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-canceled-expired-no-action"),
      },
      "poll",
    );
    expect(statusHeading(ui.host)).toBe(m["status.canceled"]);
  });
});

describe("what an error state never shows (W-41)", () => {
  it("shows no detail, instance, or type text of a problem", () => {
    const ui = idleWith({
      code: "INTERNAL",
      retryable: false,
      requestId: "req_42",
    });
    expect(alertText(ui.host)).toBe(
      `${m["error.heading"]}${m["error.generic"]}${m["label.requestId"]} req_42`,
    );
  });
});
