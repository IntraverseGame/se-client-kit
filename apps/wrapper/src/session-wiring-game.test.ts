// The session's answers outside a call (a game's pick, W-46), its end (W-7),
// and the game iframe's mount (W-37, W-38). The session is a scripted
// stand-in (fixtures/fake-session.ts).

import { describe, expect, it } from "vitest";

import { alertText, allText, statusHeading } from "./fixtures/app.ts";
import { FAKE_GAME_ORIGIN, snapshotRead } from "./fixtures/fake-session.ts";
import { ACTIVE, round, SE_ORIGIN, wired } from "./fixtures/wired.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

describe("answers outside a call, and the end", () => {
  it("a pick's answer is the player's own: focus moves to the result (W-46)", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead(ACTIVE));
      fake.setRound(round());
    });
    ui.fake.change(snapshotRead("coinflip-won"));
    await ui.settle();
    expect(statusHeading(ui.host)).toBe(m["status.won"]);
    expect(globalThis.document.activeElement?.textContent).toContain(
      m["status.won"],
    );
  });

  it("the session's end shows the session-ended state (W-7)", async () => {
    const ui = await wired(fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
    });
    ui.fake.endNow();
    await ui.settle();
    expect(allText(ui.host)).toContain(m["state.sessionEnded"]);
  });

  it("a read after the end shows the session-ended state", async () => {
    const ui = await wired(fake => {
      fake.reads.push({ kind: "session-ended" });
    });
    expect(allText(ui.host)).toContain(m["state.sessionEnded"]);
  });
});

describe("the game iframe (W-37, W-38)", () => {
  const D = FAKE_GAME_ORIGIN;

  it("asks the session to mount its own D once, and loads nothing it refuses", async () => {
    // The stand-in refuses by default, as an ended session does.
    const ui = await wired();
    expect(ui.fake.mounts).toHaveLength(1);
    expect(ui.host.querySelector("iframe")).toBeNull();
  });

  it("mounts a sandboxed, titled frame on D once the bridge accepts it", async () => {
    const ui = await wired(fake => {
      fake.setMount(() => ({ ok: true, gameOrigin: D }));
    });
    const frame = ui.host.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin",
    );
    expect(frame?.title).toBe(m["label.game"]);
    expect(frame?.getAttribute("src")).toBe(
      `${D}/?parentOrigin=${encodeURIComponent(SE_ORIGIN)}`,
    );
    // The allow-list and the Wrapper's own origin are the session's, fixed
    // at open: the UI gives only the frame, its messages, and the notice.
    expect(
      ui.fake.mounts.map(options => Object.keys(options).toSorted()),
    ).toEqual([["frame", "listen", "onIncompatible"]]);
  });

  it("never gives a refused D's frame a src, so nothing is loaded", async () => {
    // Every `src` change on the page, from any assignment.
    const assigned: (string | null)[] = [];
    const note = (records: readonly MutationRecord[]): void => {
      assigned.push(...records.map(record => record.attributeName));
    };
    const observer = new MutationObserver(note);
    observer.observe(globalThis.document, {
      subtree: true,
      attributeFilter: ["src"],
    });
    // Whether each frame has a `src` when the shell's bridge is asked.
    const atMount: boolean[] = [];
    const ui = await wired(fake => {
      fake.setMount(() => {
        const frames = [...globalThis.document.querySelectorAll("iframe")];
        atMount.push(...frames.map(frame => frame.hasAttribute("src")));
        return { ok: false, refusal: "origin-not-allowed" };
      });
    });
    note(observer.takeRecords());
    observer.disconnect();
    expect(ui.fake.mounts).toHaveLength(1);
    expect(atMount).toEqual([false]);
    expect(assigned).toEqual([]);
    expect(ui.host.querySelector("iframe")).toBeNull();
  });

  it("an incompatible game shows the error", async () => {
    const ui = await wired(fake => {
      fake.setMount(options => {
        options.onIncompatible();
        return { ok: true, gameOrigin: D };
      });
    });
    expect(alertText(ui.host)).toContain(m["error.gameIncompatible"]);
  });
});
