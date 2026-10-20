// @vitest-environment jsdom
// VT-4 at the component level: every state (V-4 to V-11 and the configuration
// error) renders its heading, its text, and its one control; no inline style;
// no link and no markup from a value. V-14's structure: one polite live region
// and one alert region from the start, a failure through the alert and every
// other change politely, icons with a text alternative, and focus on the
// heading only when the controller asks. The axe scan, keyboard use, and 200 %
// zoom run in the browser suite (VT-7).

import { describe, expect, it, vi } from "vitest";

import { HASH, report, ROUND_ID } from "./fixtures/page.ts";
import {
  ALERT_STATES,
  ALL_STATES,
  mount,
  POLITE_STATES,
} from "./fixtures/render.ts";
import { MESSAGES as M } from "./messages.ts";
import { HEADING_ID } from "./view-parts.ts";

describe("every state (VT-4)", () => {
  it.each(ALL_STATES)(
    "%s: its heading, in the title too, and its one control",
    (_name, state, heading, controls) => {
      const ui = mount();
      ui.show(state);
      expect(ui.heading()).toContain(heading);
      expect(document.title).toContain(heading);
      expect(ui.controls()).toEqual(controls);
      expect(ui.host.querySelectorAll("h1")).toHaveLength(1);
    },
  );

  it.each(ALERT_STATES)("%s: a failure, announced as an alert", (_n, state) => {
    const ui = mount();
    ui.show(state);
    expect(ui.alert()).not.toBe("");
    expect(ui.polite()).toBe("");
  });

  it.each(POLITE_STATES)("%s: announced politely", (_n, state) => {
    const ui = mount();
    ui.show(state);
    expect(ui.alert()).toBe("");
    expect(ui.polite()).not.toBe("");
  });

  it.each(ALL_STATES)("%s: no inline style, no link", (_n, state) => {
    const ui = mount();
    ui.show(state);
    expect(ui.host.querySelectorAll("[style]")).toHaveLength(0);
    expect(ui.host.querySelectorAll("a, script, img, iframe")).toHaveLength(0);
  });

  it("keeps the same live regions across states (V-14)", () => {
    const ui = mount();
    const polite = ui.host.querySelector('[aria-live="polite"]');
    const alert = ui.host.querySelector('[role="alert"]');
    for (const [, state] of ALL_STATES) ui.show(state);
    expect(ui.host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(ui.host.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(ui.host.querySelector('[aria-live="polite"]')).toBe(polite);
    expect(ui.host.querySelector('[role="alert"]')).toBe(alert);
    expect(polite?.getAttribute("aria-atomic")).toBe("true");
  });

  it("gives every icon a text alternative", () => {
    const ui = mount();
    const icons: { role: string | null; label: string | null }[] = [];
    for (const [, state] of ALL_STATES) {
      ui.show(state);
      for (const svg of ui.host.querySelectorAll("svg")) {
        icons.push({
          role: svg.getAttribute("role"),
          label: svg.getAttribute("aria-label"),
        });
      }
    }
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.filter(i => i.role !== "img")).toEqual([]);
    const labels = icons.map(i => i.label);
    expect(labels).not.toContain(null);
    expect(labels).not.toContain("");
  });
});

describe("focus (V-14)", () => {
  it("moves to the heading when the state follows the player's action", () => {
    const ui = mount();
    ui.show({ kind: "loading", roundId: ROUND_ID }, true);
    expect(document.activeElement?.id).toBe(HEADING_ID);
  });

  it("never moves on its own", () => {
    const ui = mount();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    ui.show({ kind: "report", report: report({ kind: "matches" }) });
    expect(document.activeElement).toBe(outside);
  });
});

describe("values (V-14)", () => {
  it("shows a hash in full, monospaced, with a named copy control", async () => {
    const ui = mount();
    ui.show({ kind: "report", report: report({ kind: "matches" }) });
    const codes = [...ui.host.querySelectorAll("code.vp-mono")].map(
      c => c.textContent,
    );
    expect(codes).toContain(HASH);
    const copy = ui.host.querySelector("button.vp-copy");
    expect(copy?.getAttribute("aria-label")).toMatch(/^Copy /u);
    copy?.dispatchEvent(new MouseEvent("click"));
    expect(ui.actions.copy).toHaveBeenCalledWith(HASH);
    await vi.waitFor(() => {
      expect(ui.polite()).toBe(M["action.copied"]);
    });
  });

  it("says offline distinctly when the browser reports it (V-11)", () => {
    const ui = mount();
    ui.show({ kind: "unreachable", roundId: ROUND_ID, offline: true });
    expect(ui.alert()).toContain(M["unreachable.offline"]);
    ui.show({ kind: "unreachable", roundId: ROUND_ID, offline: false });
    expect(ui.alert()).not.toContain(M["unreachable.offline"]);
  });

  it("tries again on the player's click", () => {
    const ui = mount();
    ui.show({ kind: "api-error", roundId: ROUND_ID });
    ui.host
      .querySelector("button.vp-button")
      ?.dispatchEvent(new MouseEvent("click"));
    expect(ui.actions.retry).toHaveBeenCalledOnce();
  });

  it("offers a retry for a configuration that could not load, not an invalid one (V-3)", () => {
    const ui = mount();
    ui.show({ kind: "config-error", retryable: false });
    expect(ui.host.querySelector("button")).toBeNull();
    expect(ui.alert()).toContain(M["configError.text"]);
    ui.show({ kind: "config-error", retryable: true });
    expect(ui.alert()).toContain(M["configError.retryText"]);
    ui.host
      .querySelector("button.vp-button")
      ?.dispatchEvent(new MouseEvent("click"));
    expect(ui.actions.retry).toHaveBeenCalledOnce();
  });
});
