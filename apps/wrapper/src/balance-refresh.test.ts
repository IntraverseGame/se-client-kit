// RFC-001 Q16, W-35: a page that becomes visible again reads the
// Snapshot once where no poll runs (`idle`, a round's result), so a deposit
// made in another tab shows before the next start. Merged by a debounce, never
// a poll, nothing in a state that polls, shows a problem, or is final. The
// clock is the manual one; the UI is the mounted one (fixtures/app.ts).

import { describe, expect, it, vi } from "vitest";

import {
  BALANCE_REFRESH_DEBOUNCE_MS,
  mayRefreshBalance,
  visibilityReturns,
} from "./balance-refresh.ts";
import { alertText, mount } from "./fixtures/app.ts";
import {
  problemVector,
  snapshotVector,
  withFields,
} from "./fixtures/vectors.ts";
import type { SnapshotRead } from "./round-input.ts";
import { initialState, type WrapperState } from "./wrapper-state.ts";

const idle = snapshotVector("coinflip-idle");
const deposited = withFields(idle, {
  version: idle.version + 1,
  bet: {
    ...idle.bet,
    balance: { ...idle.bet.balance, formatted: "999.99 USD" },
  },
});

/** The UI on `idle`, its read port answering `after` from the second read. */
const onIdle = async (
  first = idle,
  after: ReturnType<typeof snapshotVector> = deposited,
) => {
  const ui = mount();
  ui.answers.push(
    { kind: "snapshot", snapshot: first },
    { kind: "snapshot", snapshot: after },
  );
  ui.connect();
  await ui.settle();
  return ui;
};

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} => {
  const handle: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>(resolve => {
    handle.resolve = resolve;
  });
  return { promise, resolve: value => handle.resolve?.(value) };
};

describe("the balance after the page returns (RFC-001 Q16)", () => {
  it("reads once when the page returns, after the debounce, and shows the new balance", async () => {
    const ui = await onIdle();
    const before = ui.reads();
    expect(ui.host.textContent).not.toContain("999.99 USD");
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS - 100);
    expect(ui.reads()).toBe(before);
    await ui.step(100);
    expect(ui.reads()).toBe(before + 1);
    expect(ui.host.textContent).toContain("999.99 USD");
  });

  it("merges the events that come together into one read", async () => {
    const ui = await onIdle();
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(300);
    ui.pageReturns();
    await ui.step(300);
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before + 1);
  });

  it("never polls: a return reads once and nothing is scheduled after it", async () => {
    const ui = await onIdle();
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    await ui.step(120_000);
    expect(ui.reads()).toBe(before + 1);
  });

  it("refreshes a round's result too", async () => {
    const won = snapshotVector("coinflip-won");
    const ui = await onIdle(won, withFields(won, { version: won.version + 1 }));
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before + 1);
  });

  it("reads nothing while a typed error shows", async () => {
    const ui = await onIdle();
    ui.app.accept(
      { kind: "problem", problem: problemVector("problem-insufficient-funds") },
      "poll",
    );
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before);
  });

  it("drops a failed read quietly: no error state, the balance stays", async () => {
    const ui = await onIdle(idle, idle);
    ui.answers.length = 0;
    ui.answers.push({ kind: "network" });
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before + 1);
    expect(alertText(ui.host)).toBe("");
    expect(ui.host.textContent).toContain(idle.bet.balance.formatted);
  });

  it("takes no second read while one is in flight", async () => {
    const ui = mount();
    const slow = deferred<SnapshotRead>();
    const port = vi
      .fn<() => Promise<SnapshotRead>>()
      .mockResolvedValueOnce({ kind: "snapshot", snapshot: idle })
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ kind: "snapshot", snapshot: deposited });
    ui.app.accept({ kind: "snapshot", snapshot: idle }, "poll");
    ui.app.connect({ readSnapshot: port });
    await ui.settle();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(port).toHaveBeenCalledTimes(2);
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(port).toHaveBeenCalledTimes(2);
    slow.resolve({ kind: "snapshot", snapshot: deposited });
    await ui.settle();
    expect(ui.host.textContent).toContain("999.99 USD");
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(port).toHaveBeenCalledTimes(3);
  });

  it("reads nothing while a start or cash-out call is in flight", async () => {
    const ui = await onIdle();
    ui.app.callInFlight(true);
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before);
    ui.app.callInFlight(false);
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before + 1);
  });

  it("reads nothing in a final state", async () => {
    const ui = await onIdle();
    ui.app.block("session-ended");
    const before = ui.reads();
    ui.pageReturns();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before);
  });

  it("stops watching when the app is disposed", async () => {
    const ui = await onIdle();
    const before = ui.reads();
    ui.pageReturns();
    ui.app.dispose();
    await ui.step(BALANCE_REFRESH_DEBOUNCE_MS);
    expect(ui.reads()).toBe(before);
  });
});

const shown = (fields: Partial<WrapperState>): WrapperState => ({
  connectionProblem: false,
  offline: false,
  slow: false,
  chainNotIndependent: false,
  ...fields,
});

describe("mayRefreshBalance", () => {
  const base = { snapshot: idle } as const;

  it("is true at idle and after a round ended", () => {
    expect(mayRefreshBalance(shown(base))).toBe(true);
    expect(
      mayRefreshBalance(shown({ snapshot: snapshotVector("coinflip-lost") })),
    ).toBe(true);
  });

  it("is false with no Snapshot, a blocking state, a problem, or a connection problem", () => {
    expect(mayRefreshBalance(initialState)).toBe(false);
    expect(mayRefreshBalance(shown({ ...base, blocking: "out-of-sync" }))).toBe(
      false,
    );
    expect(
      mayRefreshBalance(shown({ ...base, blocking: "session-ended" })),
    ).toBe(false);
    expect(
      mayRefreshBalance(
        shown({
          ...base,
          problem: problemVector("problem-insufficient-funds"),
        }),
      ),
    ).toBe(false);
    expect(mayRefreshBalance(shown({ ...base, connectionProblem: true }))).toBe(
      false,
    );
    expect(mayRefreshBalance(shown({ ...base, offline: true }))).toBe(false);
  });

  it("is false while the shell's cancel is mid-way", () => {
    const lost = snapshotVector("coinflip-lost");
    for (const cancel of ["in-flight", "settling", "check-later"] as const) {
      expect(
        mayRefreshBalance(
          shown({ snapshot: lost, check: { verdict: "ok", cancel } as never }),
        ),
      ).toBe(false);
    }
  });

  it("is false for a round in progress", () => {
    for (const name of [
      "coinflip-starting",
      "coinflip-active",
      "coinflip-resolving",
    ]) {
      expect(mayRefreshBalance(shown({ snapshot: snapshotVector(name) }))).toBe(
        false,
      );
    }
  });
});

const target = (initial: string) => {
  const listeners = new Set<() => void>();
  const types: string[] = [];
  const doc = {
    visibilityState: initial,
    addEventListener: (type: "visibilitychange", listener: () => void) => {
      types.push(type);
      listeners.add(listener);
    },
    removeEventListener: (_type: "visibilitychange", listener: () => void) => {
      listeners.delete(listener);
    },
  };
  const fire = (state: string): void => {
    doc.visibilityState = state;
    for (const listener of listeners) listener();
  };
  return { doc, fire, listeners, types };
};

describe("visibilityReturns", () => {
  it("calls back when the page becomes visible, not when it becomes hidden", () => {
    const { doc, fire } = target("hidden");
    const returns: string[] = [];
    visibilityReturns(doc)(() => returns.push("visible"));
    fire("hidden");
    expect(returns).toEqual([]);
    fire("visible");
    expect(returns).toEqual(["visible"]);
  });

  it("registers only a visibilitychange listener, never focus", () => {
    const { doc, types } = target("hidden");
    visibilityReturns(doc)(() => {});
    expect(types).toEqual(["visibilitychange"]);
  });

  it("stops when unsubscribed", () => {
    const { doc, fire, listeners } = target("hidden");
    const stop = visibilityReturns(doc)(() => {});
    stop();
    fire("visible");
    expect(listeners.size).toBe(0);
  });
});
