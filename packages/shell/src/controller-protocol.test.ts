// T-9, the allow-list (W-38): the game's copy of a validated Snapshot holds
// only the allow-listed fields.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import {
  type ValidSnapshot,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { toGameSnapshot } from "./controller-protocol.ts";
import { record, snapshot } from "./fixtures/vectors.ts";

/** A vendored `valid/` Snapshot vector's input, through the validator. */
const validated = (vector: unknown, where: string): ValidSnapshot => {
  const result = validateSnapshot(record(vector, where)["input"]);
  if (!result.ok) throw new TypeError(`${where}: the vector is not valid`);
  return result.value;
};

/** The vendored `active` Snapshot carrying `cashOutValue`, step 1. */
const quotedStep1 = (): ValidSnapshot =>
  validated(
    snapshotVectors.valid["cashorcrash-active-cash-out-value"],
    "cashorcrash-active-cash-out-value",
  );

/** The same round's step 1 with no `cashOutValue`. */
const plainStep1 = (): ValidSnapshot =>
  validated(
    snapshotVectors.valid["cashorcrash-cash-out-active-step1"],
    "cashorcrash-cash-out-active-step1",
  );

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
    const quoted = quotedStep1();
    expect(quoted.cashOutValue).toBeDefined();
    const copy = toGameSnapshot(quoted);
    expect(copy).not.toHaveProperty("cashOutValue");
    expect(JSON.stringify(copy)).not.toContain('"cashOutValue"');
    expect(copy).toEqual(toGameSnapshot(plainStep1()));
  });

  it("an idle Snapshot has no round fields", () => {
    const copy = toGameSnapshot(snapshot("idle"));
    expect(copy?.status).toBe("idle");
    expect(copy).not.toHaveProperty("roundId");
    expect(copy).not.toHaveProperty("step");
  });
});
