// T-9, the allow-list (W-38): the game's copy of a validated Snapshot holds
// only the allow-listed fields.

import { describe, expect, it } from "vitest";

import { toGameSnapshot } from "./controller-protocol.ts";
import { snapshot } from "./fixtures/vectors.ts";

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

  it("an idle Snapshot has no round fields", () => {
    const copy = toGameSnapshot(snapshot("idle"));
    expect(copy?.status).toBe("idle");
    expect(copy).not.toHaveProperty("roundId");
    expect(copy).not.toHaveProperty("step");
  });
});
