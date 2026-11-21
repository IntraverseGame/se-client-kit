// W-42's row for a refused delegated start (RFC-006, slice S4; W-71): each of
// `KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, and
// `KEY_DELEGATION_NOTICE_UNKNOWN` has its own label, never the code, and is
// never retried, whatever `retryable` says. The line that the round did not
// start, and the "Sign again" and "Continue without" controls, follow the
// shell's `refused` state, not the code (S6, delegation-refusal.test.ts): with
// no delegation refused, the code is shown as any typed error. A 409
// `CONFLICT` is "any other" code.

import { describe, expect, it } from "vitest";

import {
  alertText,
  allText,
  buttonNamed,
  mount,
  statusHeading,
} from "./fixtures/app.ts";
import { snapshotVector } from "./fixtures/vectors.ts";
import { messagesFor } from "./messages.ts";
import type { ProblemInput } from "./round-input.ts";

const m = messagesFor("en").messages;

const REQUEST_ID = "req_01JKD3";

/** The UI on an idle Snapshot, after its start was answered with `read`. */
const startRefused = (read: ProblemInput) => {
  const ui = mount();
  ui.connect();
  ui.app.accept(
    { kind: "snapshot", snapshot: snapshotVector("coinflip-idle") },
    "poll",
  );
  ui.app.accept({ kind: "problem", problem: read }, "player");
  return ui;
};

const LABELS = [
  ["KEY_DELEGATION_INVALID", m["error.KEY_DELEGATION_INVALID"]],
  ["KEY_DELEGATION_EXPIRED", m["error.KEY_DELEGATION_EXPIRED"]],
  ["KEY_DELEGATION_NOTICE_UNKNOWN", m["error.KEY_DELEGATION_NOTICE_UNKNOWN"]],
] as const;

describe("a KEY_DELEGATION_* error with no delegation refused (W-42, W-71)", () => {
  it("gives each code its own label, never the generic message", () => {
    const labels = LABELS.map(([, label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain(m["error.generic"]);
  });

  describe.each(LABELS)("%s", (code, label) => {
    it.each([false, true])(
      "shows its label, and offers no retry (retryable: %s)",
      retryable => {
        const ui = startRefused({ code, retryable, requestId: REQUEST_ID });
        expect(alertText(ui.host)).toBe(
          `${m["error.heading"]}${label}${m["label.requestId"]} ${REQUEST_ID}`,
        );
        expect(buttonNamed(ui.host, m["action.retry"])).toBeUndefined();
        expect(buttonNamed(ui.host, m["action.backToStart"])).toBeUndefined();
        expect(allText(ui.host)).not.toContain(code);
        // Nothing started: the idle view stays beside the error.
        expect(statusHeading(ui.host)).toBe(m["status.idle"]);
      },
    );
  });
});

describe("a delegated start answered 409 CONFLICT (W-71)", () => {
  it("is any other code: the generic error, with try again only if retryable", () => {
    const refused = startRefused({
      code: "CONFLICT",
      retryable: false,
      requestId: REQUEST_ID,
    });
    expect(alertText(refused.host)).toBe(
      `${m["error.heading"]}${m["error.generic"]}${m["label.requestId"]} ${REQUEST_ID}`,
    );
    expect(buttonNamed(refused.host, m["action.retry"])).toBeUndefined();
    expect(
      buttonNamed(
        startRefused({ code: "CONFLICT", retryable: true }).host,
        m["action.retry"],
      ),
    ).toBeDefined();
  });
});
