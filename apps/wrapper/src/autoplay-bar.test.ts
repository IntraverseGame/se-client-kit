// T-31's Wrapper half, autoplay in the bar (W-61, RFC-005 section 6): the
// segment only for book rounds and only when the configuration turns it on;
// a count the configuration offers begins the shell's run with the chosen
// bet and the configured interval; during the run the stop with the count
// left, "Autoplay · n left", the stepper and the start control busy, no lobby
// or deposit (W-49f), the start and the stop announced and a round of the run
// not (W-46); each round's id replacing the last one's (W-40); and the run
// stopped when the page is hidden (Q3). The run's stop rules are the shell's
// (packages/shell/src/autoplay-run.test.ts).

import { describe, expect, it } from "vitest";

import { liveText } from "./fixtures/app.ts";
import { environmentDocument } from "./fixtures/environment.ts";
import { problemRead, snapshotRead } from "./fixtures/fake-session.ts";
import { type Wired, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;
const AUTOPLAY = { counts: [10, 25], minIntervalMs: 2500 };
const WITH_AUTOPLAY = environmentDocument({ autoplay: AUTOPLAY });

const atBook = (
  name = "book-lifecycle-idle",
  document: Readonly<Record<string, unknown>> = WITH_AUTOPLAY,
): Promise<Wired> =>
  wired(
    fake => {
      fake.reads.push(snapshotRead(name));
    },
    { document },
  );

const segment = (ui: Wired): HTMLButtonElement | null =>
  ui.host.querySelector<HTMLButtonElement>(".se-autoplay");

const menuLinks = (ui: Wired): number =>
  ui.host.querySelector(".se-menu .se-links")?.childElementCount ?? -1;

describe("autoplay in the bar (T-31, W-61)", () => {
  it("offers the segment on book rounds when the configuration turns it on", async () => {
    const ui = await atBook();
    expect(segment(ui)?.getAttribute("aria-label")).toBe(m["autoplay.open"]);
    expect(
      ui.host.querySelector<HTMLElement>(".se-bar")?.dataset["autoplay"],
    ).toBe("");
  });

  it("offers none without the field (fail closed), and none on a steps game", async () => {
    expect(
      segment(await atBook("book-lifecycle-idle", environmentDocument())),
    ).toBeNull();
    expect(segment(await atBook("coinflip-idle"))).toBeNull();
  });

  it("begins the shell's run with a configured count, the chosen bet, and the interval", async () => {
    const ui = await atBook();
    segment(ui)?.click();
    const counts = [
      ...ui.host.querySelectorAll<HTMLButtonElement>(".se-count"),
    ];
    expect(counts.map(count => count.textContent)).toEqual(["10", "25"]);
    counts[1]?.click();
    const [request] = ui.fake.autoplays;
    expect(request?.count).toBe(25);
    expect(request?.minIntervalMs).toBe(2500);
    expect(request?.bet).toMatchObject({ unit: expect.any(String) });
  });

  it("shows the run: the stop with the count left, the status, busy controls, no links", async () => {
    const ui = await atBook();
    expect(menuLinks(ui)).toBe(2);
    ui.fake.runState({ kind: "running", count: 10, left: 9 });
    const stop = ui.host.querySelector<HTMLButtonElement>(
      ".se-autoplay--running",
    );
    expect(stop?.textContent).toBe("9");
    expect(stop?.getAttribute("aria-label")).toContain(m["autoplay.stop"]);
    expect(ui.host.querySelector(".se-status")?.textContent).toContain(
      "Autoplay · 9 left",
    );
    expect(
      ui.host
        .querySelector('[data-focus-key="start"]')
        ?.getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      ui.host
        .querySelector('[role="spinbutton"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    // The run counts as a call in flight (W-49f).
    expect(menuLinks(ui)).toBe(0);
    expect(ui.app.calling()).toBe(true);
    stop?.click();
    expect(ui.fake.stops).toEqual(["player"]);
  });

  it("announces the run's start and stop, and no round of it (W-46)", async () => {
    const ui = await atBook();
    ui.fake.runState({ kind: "running", count: 10, left: 9 });
    expect(liveText(ui.host)).toBe(m["autoplay.started"]);
    ui.fake.change(snapshotRead("book-lifecycle-starting-bound"), "autoplay");
    await ui.settle();
    expect(liveText(ui.host)).toBe(m["autoplay.started"]);
    ui.fake.runState({ kind: "stopped", reason: "count", started: 10 });
    expect(liveText(ui.host)).toBe(m["autoplay.stopped"]);
  });

  it("moves no focus on a round of the run (W-46, W-55)", async () => {
    const ui = await atBook();
    const stop = (): HTMLElement | null =>
      ui.host.querySelector(".se-autoplay--running");
    ui.fake.runState({ kind: "running", count: 10, left: 9 });
    stop()?.focus();
    ui.fake.change(snapshotRead("book-lifecycle-starting-bound"), "autoplay");
    await ui.settle();
    ui.fake.change(snapshotRead("book-lifecycle-won"), "autoplay");
    await ui.settle();
    expect(document.activeElement?.id).not.toBe("se-status-heading");
  });

  it("moves no focus on the run's answer that stops it, an error (W-61)", async () => {
    const ui = await atBook();
    const stop = (): HTMLElement | null =>
      ui.host.querySelector(".se-autoplay--running");
    ui.fake.runState({ kind: "running", count: 10, left: 9 });
    stop()?.focus();
    // The shell has stopped the run before the UI is given its answer.
    ui.fake.runState({ kind: "stopped", reason: "error", started: 1 });
    ui.fake.change(problemRead("problem-insufficient-funds"), "autoplay");
    await ui.settle();
    expect(document.activeElement?.id).not.toBe("se-alert-heading");
    expect(ui.host.querySelector(".se-alert")?.textContent).toContain(
      m["error.INSUFFICIENT_FUNDS"],
    );
  });

  it("stops the run when the page is hidden (Q3)", async () => {
    const ui = await atBook();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    expect(ui.fake.stops).toContain("hidden");
  });
});
