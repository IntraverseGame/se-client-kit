// The gate fails closed (W-49a, W-49c): a verdict that asks for the handshake
// on a page the gate holds no operator channel for (a framing decision that
// disagrees with the page's own, which `checkEmbedding` never gives today) is
// refused as an unknown framing, never opened.

import { describe, expect, it, vi } from "vitest";

import {
  type EnvironmentConfig,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import { environmentDocument, SE_ORIGIN } from "./fixtures/environment.ts";
import { manualTimers } from "./fixtures/manual-timers.ts";
import { createOperatorGate } from "./operator-gate.ts";

vi.mock(import("./embedding.ts"), async importOriginal => ({
  ...(await importOriginal()),
  checkEmbedding: () => ({ ok: true, handshake: true }),
}));

/** The fixture document, validated. */
const fixtureConfig = (): EnvironmentConfig => {
  const result = validateEnvironmentConfig(environmentDocument(), SE_ORIGIN);
  if (!result.ok) throw new Error("fixture document refused");
  return result.config;
};

describe("the gate with no operator channel", () => {
  it("refuses a handshake verdict instead of opening", async () => {
    const gate = createOperatorGate({
      window: { addEventListener: () => {}, removeEventListener: () => {} },
      // Not framed: the gate holds no channel.
      embedding: { framed: false, nested: false, ancestorOrigins: [] },
      timers: manualTimers(),
    });
    expect(await gate.open(fixtureConfig())).toEqual({
      ok: false,
      reason: "ancestors-unknown",
    });
  });
});
