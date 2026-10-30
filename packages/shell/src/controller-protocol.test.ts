// T-9, the allow-list (W-38): the game's copy of a validated Snapshot holds
// only the allow-listed fields.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { toGameSnapshot } from "./controller-protocol.ts";
import { snapshot } from "./fixtures/vectors.ts";

/**
 * An `active` Snapshot carrying `cashOutValue` (what a cash-out credits now,
 * se-backend's ADR-050): the vendored active vector given one of its own
 * amounts as the value (the test is about the copy dropping the field, not the
 * amount). No vendored vector carries the field before the contracts sync; the
 * synced `valid/cashorcrash-active-cash-out-value` can replace this once it
 * lands.
 */
const activeWithCashOutValue = (): ValidSnapshot => {
  const active = snapshot("active");
  if (active.status !== "active") {
    throw new TypeError("the active fixture changed status");
  }
  return { ...active, cashOutValue: active.bet.defaultBet };
};

describe("toGameSnapshot", () => {
  it("copies only the allow-listed fields of an active round", () => {
    const valid = snapshot("active");
    const copy = toGameSnapshot(valid);
    expect(copy).toEqual({
      version: valid.version,
      presentation: "steps",
      status: "active",
      roundId: valid.roundId,
      step: valid.step,
      currentMultiplier: valid.currentMultiplier,
      context: {
        language: valid.context.language,
        device: valid.context.device,
        theme: { appearance: "dark" },
      },
      config: valid.config,
    });
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("leaves out proofs, the session id, links, amounts, and personalization", () => {
    const text = JSON.stringify(toGameSnapshot(snapshot("won")));
    for (const name of [
      "proofs",
      "createRoundAuth",
      "signature",
      "sessionId",
      "links",
      "view",
      "bet",
      "bankedAmount",
      "formatted",
      "schema",
      "model",
    ]) {
      expect(text).not.toContain(`"${name}"`);
    }
  });

  it("leaves out an active round's cashOutValue (W-38)", () => {
    const quoted = activeWithCashOutValue();
    expect(quoted.cashOutValue).toBeDefined();
    const copy = toGameSnapshot(quoted);
    expect(copy).not.toHaveProperty("cashOutValue");
    expect(JSON.stringify(copy)).not.toContain('"cashOutValue"');
    expect(copy).toEqual(toGameSnapshot(snapshot("active")));
  });

  it("an idle Snapshot has no round fields", () => {
    const copy = toGameSnapshot(snapshot("idle"));
    expect(copy?.status).toBe("idle");
    expect(copy).not.toHaveProperty("roundId");
    expect(copy).not.toHaveProperty("step");
  });
});
