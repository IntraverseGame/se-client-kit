// W-46 with the game frame focused: after the player's own move, the Wrapper
// blurs the game's iframe element before it focuses the result or error
// heading, since some engines (Firefox with its frames in the parent's
// process, as in Playwright's Firefox build) do not move the focus out of a
// focused iframe on `focus()` alone (e2e: focus-from-frame.spec.ts). Without a
// focused game frame, or after a poll, nothing more happens. The rest of the
// focus rule is in accessibility.test.ts.

import { describe, expect, it, vi } from "vitest";

import { mount, type Mounted } from "./fixtures/app.ts";
import { problemVector, snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/**
 * A round in play with an iframe in the game host, and a record, in order, of
 * the frame element's `blur()` calls and of a heading taking the focus.
 */
const roundWithFrame = (): {
  readonly ui: Mounted;
  readonly frame: HTMLIFrameElement;
  readonly order: readonly string[];
} => {
  const ui = mount();
  ui.app.accept(
    { kind: "snapshot", snapshot: snapshotVector("cashorcrash-active-row2") },
    "poll",
  );
  const frame = document.createElement("iframe");
  ui.app.gameHost().append(frame);
  const order: string[] = [];
  const blur = frame.blur.bind(frame);
  vi.spyOn(frame, "blur").mockImplementation(() => {
    order.push("frame blur()");
    blur();
  });
  ui.host.addEventListener("focusin", event => {
    if (event.target instanceof HTMLHeadingElement) {
      order.push(`${event.target.tagName} focused`);
    }
  });
  return { ui, frame, order };
};

describe("focus from a focused game frame (W-46)", () => {
  it("blurs the focused game frame, then focuses the result heading", () => {
    const { ui, frame, order } = roundWithFrame();
    frame.focus();
    expect(document.activeElement).toBe(frame);
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-won-cashout") },
      "player",
    );
    expect(order).toEqual(["frame blur()", "H1 focused"]);
    expect(document.activeElement?.textContent).toBe(m["status.won"]);
  });

  it("blurs the focused game frame, then focuses the error heading", () => {
    const { ui, frame, order } = roundWithFrame();
    frame.focus();
    expect(document.activeElement).toBe(frame);
    // The move is answered with an error.
    ui.app.accept(
      {
        kind: "problem",
        problem: problemVector("problem-default-code-invalid-argument"),
      },
      "player",
    );
    expect(order).toEqual(["frame blur()", "H2 focused"]);
    expect(document.activeElement?.textContent).toBe(m["error.heading"]);
  });

  it("blurs nothing when the game frame does not have the focus", () => {
    const { ui, order } = roundWithFrame();
    const outside = document.createElement("button");
    document.body.append(outside);
    const outsideBlur = vi.spyOn(outside, "blur");
    outside.focus();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-won-cashout") },
      "player",
    );
    expect(order).toEqual(["H1 focused"]);
    expect(outsideBlur).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe(m["status.won"]);
  });

  it("blurs no iframe outside the game host", () => {
    const { ui, order } = roundWithFrame();
    const other = document.createElement("iframe");
    document.body.append(other);
    const otherBlur = vi.spyOn(other, "blur");
    other.focus();
    expect(document.activeElement).toBe(other);
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-won-cashout") },
      "player",
    );
    expect(order).toEqual(["H1 focused"]);
    expect(otherBlur).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe(m["status.won"]);
  });

  it("a poll that makes a focused frame inert hands the focus to the status heading (the inert-frame rule)", () => {
    const { ui, frame, order } = roundWithFrame();
    frame.focus();
    ui.app.accept(
      { kind: "snapshot", snapshot: snapshotVector("cashorcrash-won-cashout") },
      "poll",
    );
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(order).toEqual(["frame blur()", "H1 focused"]);
    expect(document.activeElement?.textContent).toBe(m["status.won"]);
  });
});
