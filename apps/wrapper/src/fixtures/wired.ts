// Test-only: the Wrapper's UI wired to a scripted session
// (fake-session.ts), with a fake window.

import type { RoundState } from "@intraverse/se-client-shell";

import {
  createMessageDispatch,
  type MessageTarget,
} from "../message-dispatch.ts";
import { wireSession } from "../session-wiring.ts";
import { mount, type Mounted } from "./app.ts";
import {
  createFakeSession,
  type FakeSession,
  validSnapshot,
} from "./fake-session.ts";

export const SE_ORIGIN = "https://play.example.com";

export const fakeWindow = (): MessageTarget & {
  readonly listeners: () => number;
} => {
  const listeners = new Set<unknown>();
  return {
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    listeners: () => listeners.size,
  };
};

export type Wired = Mounted & {
  readonly fake: FakeSession;
};

export const wired = async (
  prepare: (fake: FakeSession) => void = () => {},
): Promise<Wired> => {
  const ui = mount();
  const fake = createFakeSession();
  prepare(fake);
  wireSession(
    {
      app: ui.app,
      doc: globalThis.document,
      ownOrigin: SE_ORIGIN,
      messages: createMessageDispatch(fakeWindow()),
    },
    fake.session,
  );
  await ui.settle();
  return { ...ui, fake };
};

export const ACTIVE = "coinflip-active";
export const activeId = validSnapshot(ACTIVE).roundId ?? "";

export const round = (overrides: Partial<RoundState> = {}): RoundState => ({
  roundId: activeId,
  verdict: "ready",
  outOfSync: false,
  cashOutOffered: false,
  cancel: "none",
  ...overrides,
});

export const gameShown = (ui: Mounted): boolean =>
  ui.host.querySelector<HTMLElement>(".se-game")?.hidden === false;
