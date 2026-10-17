// T-14 and T-14a at the component level (W-45 to W-48): a status change is
// announced through a polite live region and an error through `role="alert"`;
// focus moves to the result or error heading only after the player's own
// action, never after a poll; win, loss, and error carry text and an icon with
// a text alternative beside the colour; every control has a text label in the
// session's language, with the fallback; the stylesheet honours reduced
// motion and reflows at 200 % zoom. The axe scan of every state, keyboard-only
// play, and the real zoom run in the browser suite (T-14, T-14a).

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  alertText,
  buttonNamed,
  liveText,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import {
  problemVector,
  snapshotVector,
  withFields,
} from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/** A control's visible text label (an input's is its `<label>`). */
const labelOf = (control: Element): string =>
  (control instanceof HTMLInputElement
    ? control.closest("label")?.textContent
    : control.textContent
  )?.trim() ?? "";

/** A stylesheet line with a px length, outside the visually-hidden helper. */
const usesPx = (line: string): boolean =>
  /\d+px/u.test(line) && !line.includes("se-visually-hidden");

const stylesheet = readFileSync(`${import.meta.dirname}/styles.css`, "utf8");

describe("live regions (W-46)", () => {
  it("has one polite, atomic live region and one alert panel", () => {
    const ui = mount();
    expect(ui.host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(
      ui.host
        .querySelector('[aria-live="polite"]')
        ?.getAttribute("aria-atomic"),
    ).toBe("true");
    expect(ui.host.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it("announces a status change politely", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-resolving") },
      "poll",
    );
    expect(liveText(ui.host)).toBe(m["status.resolving"]);
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-won") },
      "poll",
    );
    expect(liveText(ui.host)).toBe(m["status.won"]);
  });

  it("shows an error in the alert panel, not in the live region", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
      "poll",
    );
    ui.app.accept(
      { kind: "problem", problem: problemVector("problem-insufficient-funds") },
      "poll",
    );
    expect(alertText(ui.host)).toContain(m["error.INSUFFICIENT_FUNDS"]);
    expect(liveText(ui.host)).toBe(m["status.idle"]);
  });

  it("does not re-render the alert for a poll that changes nothing", () => {
    const ui = mount();
    ui.app.accept({ kind: "network" }, "poll");
    const first = ui.host.querySelector('[role="alert"] h2');
    ui.app.accept({ kind: "network" }, "poll");
    expect(ui.host.querySelector('[role="alert"] h2')).toBe(first);
  });
});

describe("focus (W-46)", () => {
  it("never moves focus after a poll", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-resolving") },
      "poll",
    );
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-won") },
      "poll",
    );
    expect(document.activeElement).toBe(outside);
    ui.app.accept(
      {
        kind: "problem",
        problem: problemVector("problem-default-code-unknown"),
      },
      "poll",
    );
    expect(document.activeElement).toBe(outside);
  });

  it("keeps a focused control focused when a poll re-renders its section", () => {
    const won = snapshotVector("coinflip-won");
    const ui = mount();
    ui.app.accept({ kind: "snapshot", snapshot: won }, "poll");
    buttonNamed(ui.host, m["action.copyRoundId"])?.focus();
    // A new round started elsewhere: the ended round's panel stays (W-40).
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: withFields(snapshotVector("coinflip-starting"), {
          version: won.version + 1,
        }),
      },
      "poll",
    );
    expect(document.activeElement?.textContent).toBe(m["action.copyRoundId"]);
  });

  it("moves focus to the result heading after the player's own action", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-active-row2") },
      "poll",
    );
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-won-cashout") },
      "player",
    );
    expect(document.activeElement?.textContent).toBe(m["status.won"]);
    expect(document.activeElement?.tagName).toBe("H1");
  });

  it("moves focus to the error heading after the player's own action", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
      "poll",
    );
    ui.app.accept(
      { kind: "problem", problem: problemVector("problem-insufficient-funds") },
      "player",
    );
    expect(document.activeElement?.textContent).toBe(m["error.heading"]);
    expect(document.activeElement?.tagName).toBe("H2");
  });
});

describe("text and an icon beside colour (W-47)", () => {
  it.each([
    ["coinflip-won", "win", m["icon.win"], m["status.won"]],
    ["coinflip-lost", "loss", m["icon.loss"], m["status.lost"]],
  ])(
    "%s has its icon with a text alternative and its text",
    (name, icon, label, text) => {
      const ui = mount();
      ui.app.accept(
        { kind: "snapshot", snapshot: snapshotVector(name) },
        "poll",
      );
      const svg = ui.host.querySelector(`.se-status h1 .se-icon--${icon}`);
      expect(svg?.getAttribute("role")).toBe("img");
      expect(svg?.getAttribute("aria-label")).toBe(label);
      expect(statusHeading(ui.host)).toBe(text);
    },
  );

  it("gives an error its icon with a text alternative and its text", () => {
    const ui = mount();
    ui.app.accept(
      {
        kind: "problem",
        problem: problemVector("problem-default-code-unknown"),
      },
      "poll",
    );
    const svg = ui.host.querySelector('[role="alert"] .se-icon--error');
    expect(svg?.getAttribute("aria-label")).toBe(m["icon.error"]);
    expect(alertText(ui.host)).toContain(m["error.heading"]);
  });

  it("uses no inline style anywhere (the CSP allows none)", () => {
    const ui = mount();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
      "poll",
    );
    ui.app.accept({ kind: "network" }, "poll");
    expect(ui.host.querySelectorAll("[style]")).toHaveLength(0);
  });
});

describe("labels in the session's language (W-48)", () => {
  it("falls back to English for a session language with no catalogue", () => {
    const ui = mount();
    const snapshot = snapshotVector("coinflip-idle");
    expect(snapshot.context.language).toBe("de");
    ui.app.accept({ kind: "snapshot", snapshot }, "poll");
    expect(ui.host.querySelector(".se-wrapper")?.getAttribute("lang")).toBe(
      "en",
    );
  });

  it("names every control by its text", () => {
    const ui = mount();
    ui.app.connect({
      readSnapshot: () => Promise.resolve({ kind: "network" }),
      intents: { start: () => {}, newRound: () => {} },
    });
    for (const name of ["coinflip-idle", "coinflip-won"]) {
      ui.app.accept(
        { kind: "snapshot", snapshot: snapshotVector(name) },
        "poll",
      );
      const labels = [...ui.host.querySelectorAll("button, a, input")].map(
        control => labelOf(control),
      );
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.filter(label => label === "")).toEqual([]);
    }
  });

  it("shows money as the Snapshot's formatted string", () => {
    const ui = mount();
    ui.app.accept(
      {
        kind: "snapshot",
        snapshot: snapshotVector("coinflip-idle-eth-big-amount"),
      },
      "poll",
    );
    const { balance } = snapshotVector("coinflip-idle-eth-big-amount").bet;
    expect(ui.host.textContent).toContain(balance.formatted);
    expect(ui.host.textContent).not.toContain(balance.value);
  });
});

/** The classes the stylesheet animates (`animation: se-...`). */
const animatedClasses = (): readonly string[] =>
  [...stylesheet.matchAll(/\.([\w-]+)\s*\{[^}]*animation: se-/gu)].map(
    match => match[1] ?? "",
  );

/** Whether the reduced-motion block names `name` with `animation: none`. */
const stoppedWhenReduced = (name: string): boolean =>
  new RegExp(String.raw`\.${name}\s*\{\s*animation: none;`, "u").test(
    stylesheet.split("@media (prefers-reduced-motion: reduce)")[1] ?? "",
  );

describe("the stylesheet (W-45, W-47)", () => {
  it("stops motion under prefers-reduced-motion", () => {
    expect(stylesheet).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\{[^}]*animation: none;/u,
    );
  });

  it("names every animated class under prefers-reduced-motion, which the universal rule cannot override", () => {
    expect(animatedClasses().length).toBeGreaterThan(0);
    expect(animatedClasses().filter(name => !stoppedWhenReduced(name))).toEqual(
      [],
    );
  });

  it("shows a focus indicator", () => {
    expect(stylesheet).toMatch(/:focus-visible\s*\{\s*outline:/u);
  });

  it("sizes in rem, never fixed px boxes, so it reflows at 200 % zoom", () => {
    const pxDeclarations = stylesheet.split("\n").filter(line => usesPx(line));
    // Only the visually-hidden helper uses px (1px clip box).
    expect(
      pxDeclarations.every(line =>
        /^\s*(width|height|margin): -?1px;$/u.test(line),
      ),
    ).toBe(true);
  });

  it("makes targets at least 24 by 24 CSS pixels", () => {
    expect(stylesheet).toMatch(/min-width: 2\.75rem;\s*min-height: 2\.75rem;/u);
  });
});
