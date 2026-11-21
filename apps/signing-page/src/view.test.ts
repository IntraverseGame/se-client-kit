// @vitest-environment jsdom
// T-47, the view (SP-10, SP-11): each state's heading, in a polite live region
// and focused; no mark on an `approved` notice; a wallet name shown as text,
// never markup; the "waiting for the wallet" text in the live region with
// every button disabled; the expiry as a date and time in the browser's
// locale, never raw seconds.

import { describe, expect, it } from "vitest";

import { formatExpiry, TEXT } from "./messages.ts";
import { createView, type ViewState } from "./view.ts";
import type { AnnouncedWallet } from "./wallet-discovery.ts";

const EXPIRY = 1_795_000_000;
const notice = { id: "n-1", text: "I approve.", status: "approved" } as const;
const wallet = (name: string): AnnouncedWallet => ({
  uuid: name,
  name,
  provider: { request: () => Promise.resolve(null) },
});

const mounted = () => {
  document.body.replaceChildren();
  const root = document.createElement("div");
  document.body.append(root);
  const picked: string[] = [];
  const view = createView(root, picked_ => {
    picked.push(picked_.name);
  });
  return { root, view, picked };
};

describe("createView (SP-10, SP-11)", () => {
  it.each([
    [{ kind: "lost" }, TEXT.lost],
    [{ kind: "config-error" }, TEXT.configError],
    [{ kind: "waiting-for-game" }, TEXT.waitingForGame],
    [{ kind: "timed-out" }, TEXT.timedOut],
    [{ kind: "discovering" }, TEXT.discovering],
    [{ kind: "finishing" }, TEXT.finishing],
  ] as const)("shows %j with its heading, live and focused", (state, text) => {
    const { root, view } = mounted();
    view.show(state as ViewState);
    const heading = root.querySelector("h1");
    expect(heading?.textContent).toBe(text);
    expect(heading?.closest("[aria-live]")?.getAttribute("aria-live")).toBe(
      "polite",
    );
    expect(document.activeElement).toBe(heading);
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  it("marks no approved notice, and shows a name as text", () => {
    const { root, view } = mounted();
    view.show({
      kind: "choose",
      notice,
      expiry: EXPIRY,
      wallets: [wallet("<b>Bold</b>")],
    });
    expect(root.querySelector(".sp-mark")).toBeNull();
    expect(root.querySelector(".sp-notice")?.textContent).toBe("I approve.");
    expect(root.querySelector("button")?.textContent).toBe("<b>Bold</b>");
    expect(root.querySelector("b")).toBeNull();
  });

  it("waits for the wallet with every button disabled and the text live", () => {
    const { root, view, picked } = mounted();
    view.show({
      kind: "wallet",
      notice,
      expiry: EXPIRY,
      wallets: [wallet("One"), wallet("Two")],
    });
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.map(button => button.disabled)).toEqual([true, true]);
    buttons[0]?.click();
    expect(picked).toEqual([]);
    expect(root.querySelector("[aria-live]")?.textContent).toBe(
      `${TEXT.chooseHeading}${TEXT.confirmInWallet}`,
    );
    expect(document.activeElement).toBe(root.querySelector("h1"));
  });

  it("calls back once for the first click only", () => {
    const { root, view, picked } = mounted();
    view.show({
      kind: "choose",
      notice,
      expiry: EXPIRY,
      wallets: [wallet("One"), wallet("Two")],
    });
    const [one, two] = root.querySelectorAll("button");
    one?.click();
    two?.click();
    expect(picked).toEqual(["One"]);
  });
});

describe("formatExpiry", () => {
  it("is the browser's long date and short time, never the raw seconds", () => {
    const text = formatExpiry(EXPIRY);
    expect(text).toBe(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(EXPIRY * 1000)),
    );
    expect(text).toContain("2026");
    expect(text).not.toContain(String(EXPIRY));
  });
});
