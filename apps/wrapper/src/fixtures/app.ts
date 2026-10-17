// Test-only: the Wrapper's UI mounted in jsdom with a manual clock, a scripted
// Snapshot read port, a recording clipboard, and a switchable online state.
// Every query helper reads the DOM as a player or assistive technology would.

import { validateEnvironmentConfig } from "../environment-config.ts";
import type { SnapshotRead } from "../round-input.ts";
import { createWrapperApp, type WrapperApp } from "../wrapper-app.ts";
import { environmentDocument } from "./environment.ts";
import { flush, stepTimers } from "./flush.ts";
import { type ManualTimers, manualTimers } from "./manual-timers.ts";

export type Mounted = {
  readonly app: WrapperApp;
  readonly host: HTMLElement;
  readonly timers: ManualTimers;
  /** What the next reads answer, in order (the last one repeats). */
  readonly answers: SnapshotRead[];
  /** How many reads the port served. */
  readonly reads: () => number;
  readonly copied: string[];
  /** Connects the session's Snapshot read port, which answers from `answers`. */
  readonly connect: () => void;
  readonly setOnline: (online: boolean) => void;
  /** Moves the clock and lets the reads it starts settle. */
  readonly step: (ms: number) => Promise<void>;
  readonly settle: () => Promise<void>;
};

/** The UI, configured with `document` (a valid production one by default). */
export const mount = (
  document: Readonly<Record<string, unknown>> = environmentDocument(),
): Mounted => {
  globalThis.document.body.replaceChildren();
  const host = globalThis.document.createElement("div");
  globalThis.document.body.append(host);
  const timers = manualTimers();
  const answers: SnapshotRead[] = [];
  const copied: string[] = [];
  let reads = 0;
  let online = true;
  const listeners = new Set<() => void>();
  const app = createWrapperApp({
    doc: globalThis.document,
    host,
    timers,
    connectivity: {
      onLine: () => online,
      subscribe: onChange => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
    },
    copyText: text => {
      copied.push(text);
      return Promise.resolve();
    },
  });
  const result = validateEnvironmentConfig(document);
  if (!result.ok) {
    throw new Error("fixture document refused");
  }
  app.configure(result.config);
  return {
    app,
    host,
    timers,
    answers,
    reads: () => reads,
    copied,
    setOnline: value => {
      online = value;
      for (const listener of listeners) listener();
    },
    step: ms => stepTimers(timers, ms),
    settle: () => flush(),
    connect: (): void => {
      app.connect({
        readSnapshot: () => {
          reads += 1;
          return Promise.resolve(
            answers.length > 1
              ? (answers.shift() ?? { kind: "network" })
              : (answers[0] ?? { kind: "network" }),
          );
        },
      });
    },
  };
};

const text = (element: Element | null): string =>
  (element?.textContent ?? "").replaceAll(/\s+/gu, " ").trim();

/** The status section's heading. */
export const statusHeading = (host: HTMLElement): string =>
  text(host.querySelector(".se-status h1"));

/** The text of the `role="alert"` panel. */
export const alertText = (host: HTMLElement): string =>
  text(host.querySelector('[role="alert"]'));

/** The text of the polite live region. */
export const liveText = (host: HTMLElement): string =>
  text(host.querySelector('[aria-live="polite"]'));

/** A button by its visible label. */
export const buttonNamed = (
  host: HTMLElement,
  name: string,
): HTMLButtonElement | undefined =>
  [...host.querySelectorAll("button")].find(button => text(button) === name);

/** A link whose text starts with `name`. */
export const linkNamed = (
  host: HTMLElement,
  name: string,
): HTMLAnchorElement | undefined =>
  [...host.querySelectorAll("a")].find(link => text(link).startsWith(name));

export const allText = (host: HTMLElement): string => text(host);
