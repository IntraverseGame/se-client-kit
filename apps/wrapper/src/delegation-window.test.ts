// T-46, opening the signing window from the consent dialog (W-66, W-67): the
// confirm's `click` handler closes the dialog and calls `window.open`
// synchronously, under the click's activation (the stub here refuses any call
// made after a microtask of the click, as a popup blocker does), with exactly
// `<signingPageOrigin>/`, `"_blank"`, and the features, and hands the handle
// to the shell; a blocked window (`null`) goes to the shell too. The message
// router's third route: the handle's messages reach the shell, and the page's
// own window, the game frame, and the operator page do not.

import { describe, expect, it } from "vitest";

import {
  buttonIn,
  consentDialog,
  delegationUi,
  openMenu,
  SIGNER,
} from "./fixtures/delegation-ui.ts";
import {
  createMessageDispatch,
  type MessageTarget,
} from "./message-dispatch.ts";
import { messagesFor } from "./messages.ts";
import { SIGNING_WINDOW_FEATURES } from "./signing-window.ts";

const m = messagesFor("en").messages;

/** A page that fires `message` events with a given source. */
const page = (): MessageTarget & {
  readonly fire: (source: unknown) => void;
} => {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    fire: source => {
      for (const listener of listeners) {
        listener({
          source,
          origin: SIGNER,
          data: { schema: "se.delegation/1", type: "ready" },
        } as MessageEvent);
      }
    },
  };
};

/**
 * A stand-in for transient user activation: true during the click's dispatch
 * only, false from its first microtask on.
 */
const activation = () => {
  let active = false;
  document.addEventListener(
    "click",
    () => {
      active = true;
      queueMicrotask(() => {
        active = false;
      });
    },
    { capture: true },
  );
  return {
    check: (): void => {
      if (!active) throw new Error("window.open outside the click");
    },
  };
};

const confirmFrom = async (
  options: Parameters<typeof delegationUi>[0] = {},
) => {
  const ui = await delegationUi(options);
  buttonIn(openMenu(ui.host), m["delegation.link"])?.click();
  const dialog = consentDialog();
  buttonIn(dialog, m["delegation.confirm"])?.click();
  return { ui, dialog };
};

describe("the confirm opens the signing window (T-46, W-66)", () => {
  it("calls window.open in the click, with exactly the origin plus /, _blank, and the features", async () => {
    const user = activation();
    const { ui, dialog } = await confirmFrom({ open: user.check });
    expect(ui.opened).toEqual([
      {
        url: `${SIGNER}/`,
        target: "_blank",
        features: SIGNING_WINDOW_FEATURES,
      },
    ]);
    expect(SIGNING_WINDOW_FEATURES).toBe("popup,width=480,height=720");
    expect(dialog.open).toBe(false);
    expect(ui.fake.delegation.begun).toEqual([ui.handle]);
  });

  it("would fail a call made after a microtask: the stub refuses it", async () => {
    const user = activation();
    document.body.click();
    await Promise.resolve();
    expect(() => {
      user.check();
    }).toThrow("window.open outside the click");
  });

  it("closes the dialog before the window opens", async () => {
    let openWhenCalled: boolean | undefined;
    const { ui } = await confirmFrom({
      open: () => {
        openWhenCalled = consentDialog().open;
      },
    });
    expect(openWhenCalled).toBe(false);
    expect(ui.opened).toHaveLength(1);
  });

  it("hands a blocked window (null) to the shell, and keeps the entry offered", async () => {
    const { ui } = await confirmFrom({ blocked: true });
    expect(ui.fake.delegation.begun).toEqual([null]);
    expect(buttonIn(openMenu(ui.host), m["delegation.link"])).toBeDefined();
  });
});

describe("the message router's third route (T-46, W-67)", () => {
  it("routes the handle's messages to the shell, and nothing else", async () => {
    const target = page();
    const parent = { name: "operator page" };
    const messages = createMessageDispatch(target, parent);
    const game = { name: "game frame" };
    messages.onGame(game, () => {});
    const { ui } = await confirmFrom({ messages });
    target.fire(ui.handle);
    expect(ui.fake.delegation.received).toHaveLength(1);
    target.fire(globalThis.window);
    target.fire(game);
    target.fire(parent);
    target.fire({ name: "another window" });
    expect(ui.fake.delegation.received).toHaveLength(1);
  });

  it("stops routing once the attempt ends", async () => {
    const target = page();
    const { ui } = await confirmFrom({
      messages: createMessageDispatch(target),
    });
    ui.fake.delegation.set({ state: "declined" });
    target.fire(ui.handle);
    expect(ui.fake.delegation.received).toHaveLength(0);
  });
});
