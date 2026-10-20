// Test fixtures of the page's view (jsdom): a mounted page with recorded
// actions, query helpers that return text (never `null`), and every state the
// page can be in, with its heading and its one control.

import { vi } from "vitest";

import type { CheckResult } from "../check-result.ts";
import { MESSAGES as M } from "../messages.ts";
import type { PageState } from "../page-state.ts";
import { mountPage } from "../render.ts";
import type { PageActions } from "../view-parts.ts";
import {
  checks,
  evidence,
  HASH,
  OTHER_HASH,
  report,
  ROUND_ID,
} from "./page.ts";

/** Mounts the page into a fresh `<main id="verify-root">`. */
export const mount = () => {
  document.body.replaceChildren();
  const host = document.createElement("main");
  host.id = "verify-root";
  document.body.append(host);
  const actions = {
    submit: vi.fn<PageActions["submit"]>(),
    retry: vi.fn<PageActions["retry"]>(),
    copy: vi.fn<PageActions["copy"]>(() => Promise.resolve()),
  };
  const view = mountPage(document, host, actions);
  const textOf = (selector: string): string =>
    host.querySelector(selector)?.textContent ?? "";
  return {
    host,
    actions,
    show: (state: PageState, focus = false) => {
      view.show(state, focus);
    },
    heading: () => textOf("h1").trim(),
    polite: () => textOf('[aria-live="polite"]'),
    alert: () => textOf('[role="alert"]'),
    /** The action controls, apart from the copy controls of values. */
    controls: () =>
      [...host.querySelectorAll("button:not(.vp-copy)")].map(b =>
        b.textContent.trim(),
      ),
    text: () => host.textContent,
    /** The texts of the elements an element's `aria-describedby` names. */
    describedBy: (selector: string): string[] =>
      (host.querySelector(selector)?.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map(id => textOf(`#${id}`).trim()),
  };
};

export const failing = (id: CheckResult["id"]): CheckResult => ({
  id,
  title: `Check ${id}`,
  status: "mismatch",
  comparisons: [
    {
      name: `value ${id}`,
      recomputed: HASH,
      evidence: OTHER_HASH,
      matches: false,
    },
  ],
});

type Case = readonly [string, PageState, string, readonly string[]];

/** The states that announce through `role="alert"` (V-14). */
export const ALERT_STATES: readonly Case[] = [
  [
    "config-error (invalid)",
    { kind: "config-error", retryable: false },
    M["configError.heading"],
    [],
  ],
  [
    "config-error (network or unreadable)",
    { kind: "config-error", retryable: true },
    M["configError.heading"],
    [M["action.tryAgain"]],
  ],
  [
    "mismatch",
    {
      kind: "report",
      report: report(
        { kind: "mismatch", failed: [3] },
        { checks: checks(failing(3)) },
      ),
    },
    M["mismatch.heading"],
    [],
  ],
  [
    "chain-unverified",
    { kind: "report", report: report({ kind: "chain-unverified" }) },
    M["chainUnverified.heading"],
    [M["action.checkAgain"]],
  ],
  [
    "api-error",
    { kind: "api-error", roundId: ROUND_ID },
    M["apiError.heading"],
    [M["action.tryAgain"]],
  ],
  [
    "unreachable",
    { kind: "unreachable", roundId: ROUND_ID, offline: false },
    M["unreachable.heading"],
    [M["action.tryAgain"]],
  ],
];

/** The states that announce through the polite live region (V-14). */
export const POLITE_STATES: readonly Case[] = [
  ["starting", { kind: "starting" }, M["starting.heading"], []],
  [
    "form",
    { kind: "form", text: "", error: false },
    M["form.heading"],
    [M["form.submit"]],
  ],
  ["loading", { kind: "loading", roundId: ROUND_ID }, M["loading.heading"], []],
  [
    "matches",
    { kind: "report", report: report({ kind: "matches" }) },
    M["matches.heading"],
    [],
  ],
  [
    "not-ended",
    {
      kind: "report",
      report: report({ kind: "not-recomputable", reason: "not-ended" }),
    },
    M["notEnded.heading"],
    [M["action.checkAgain"]],
  ],
  [
    "unknown-kernel",
    {
      kind: "report",
      report: report(
        { kind: "not-recomputable", reason: "unknown-kernel" },
        { evidence: evidence({ kernelVersion: 7 }) },
      ),
    },
    M["unknownKernel.heading"],
    [],
  ],
  [
    "unsupported-shape",
    {
      kind: "report",
      report: report(
        { kind: "not-recomputable", reason: "unsupported-shape" },
        {
          evidence: evidence({
            steps: [
              { optionCount: 2, selectedIndex: 1, losingIndex: 0 },
              { optionCount: 2, selectedIndex: 0, losingIndex: 1 },
            ],
          }),
        },
      ),
    },
    M["unsupportedShape.heading"],
    [],
  ],
  [
    "not-found",
    { kind: "not-found", roundId: ROUND_ID },
    M["notFound.heading"],
    [M["form.submit"]],
  ],
];

export const ALL_STATES: readonly Case[] = [...POLITE_STATES, ...ALERT_STATES];
