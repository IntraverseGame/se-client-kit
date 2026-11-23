// The signing window's plumbing (W-66, W-67; S5): `window.open` is called
// synchronously with exactly the signing page's origin plus `/`, `"_blank"`,
// and the features; its handle (or `null`) goes to the shell's `begin`; and the
// handle's messages reach `receiveDelegation` only while the attempt runs.

import type {
  DelegationBegin,
  DelegationState,
} from "@intraverse/se-client-shell";
import { describe, expect, it, vi } from "vitest";

import {
  createMessageDispatch,
  type MessageTarget,
} from "./message-dispatch.ts";
import {
  openSigningWindow,
  SIGNING_WINDOW_FEATURES,
} from "./signing-window.ts";

const SIGNER = "https://signer.example.org";

const page = (): MessageTarget & {
  readonly fire: (source: unknown, data: unknown) => void;
} => {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    fire: (source, data) => {
      for (const listener of listeners) {
        listener({ source, origin: SIGNER, data } as MessageEvent);
      }
    },
  };
};

const handle = {
  closed: false,
  close: () => {},
  focus: () => {},
  postMessage: () => {},
};

const fakeSession = (begun: "started" | "refused") => {
  const listeners = new Set<(state: DelegationState) => void>();
  return {
    beginDelegation: vi.fn<(handle: unknown) => DelegationBegin>(() =>
      begun === "started"
        ? ({ kind: "started" } as const)
        : ({ kind: "refused", reason: "busy" } as const),
    ),
    receiveDelegation: vi.fn<(message: unknown) => void>(),
    onDelegation: (listener: (state: DelegationState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (state: DelegationState) => {
      for (const listener of Array.from(listeners)) listener(state);
    },
  };
};

describe("openSigningWindow (W-66, W-67)", () => {
  it("opens the window synchronously and hands its handle to the shell", () => {
    const open = vi.fn<() => typeof handle>(() => handle);
    const session = fakeSession("started");
    const target = page();
    const result = openSigningWindow({
      open,
      signingPageOrigin: SIGNER,
      session,
      messages: createMessageDispatch(target, {}),
    });
    // Synchronous: done before this line, with no microtask in between.
    expect(open).toHaveBeenCalledWith(
      `${SIGNER}/`,
      "_blank",
      SIGNING_WINDOW_FEATURES,
    );
    expect(SIGNING_WINDOW_FEATURES).toBe("popup,width=480,height=720");
    expect(session.beginDelegation).toHaveBeenCalledWith(handle);
    expect(result).toEqual({ begun: { kind: "started" }, handle });
  });

  it("routes the handle's messages to the shell only while the attempt runs", () => {
    const session = fakeSession("started");
    const target = page();
    openSigningWindow({
      open: () => handle,
      signingPageOrigin: SIGNER,
      session,
      messages: createMessageDispatch(target, {}),
    });
    target.fire(handle, "ready");
    target.fire({}, "other");
    expect(session.receiveDelegation).toHaveBeenCalledTimes(1);
    expect(session.receiveDelegation).toHaveBeenCalledWith({
      source: handle,
      origin: SIGNER,
      data: "ready",
    });
    session.emit({ state: "declined" });
    target.fire(handle, "late");
    expect(session.receiveDelegation).toHaveBeenCalledTimes(1);
  });

  it.each<[string, "started" | "refused", typeof handle | null]>([
    ["a blocked window", "started", null],
    ["a refused begin", "refused", handle],
  ])("opens no route for %s", (_name, begun, opened) => {
    const session = fakeSession(begun);
    const target = page();
    openSigningWindow({
      open: () => opened,
      signingPageOrigin: SIGNER,
      session,
      messages: createMessageDispatch(target, {}),
    });
    expect(session.beginDelegation).toHaveBeenCalledWith(opened);
    target.fire(handle, "ready");
    expect(session.receiveDelegation).not.toHaveBeenCalled();
  });
});
