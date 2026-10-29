// @vitest-environment jsdom
// VT-4 for the form (V-4) and the report states (V-6 to V-8, V-13): the
// field's visible label and its error tied by `aria-describedby`, a script
// submit, the result shown only when established, every failed check named
// with both values, the development indicator beside check 6, and values from
// the API (links included) rendered as text.

import { describe, expect, it } from "vitest";

import type { CheckResult } from "./check-result.ts";
import {
  checks,
  evidence,
  HASH,
  OTHER_HASH,
  report,
  ROUND_ID,
} from "./fixtures/page.ts";
import { failing, mount } from "./fixtures/render.ts";
import { MESSAGES as M } from "./messages.ts";
import type { RandomnessProofEvidence } from "./round-evidence.ts";
import { FIELD_ID } from "./view-parts.ts";

const FIELD = `#${FIELD_ID}`;

describe("the form (V-4, V-14)", () => {
  it("has a visible label tied to the field, and a hint", () => {
    const ui = mount();
    ui.show({ kind: "form", text: "", error: false });
    const label = ui.host.querySelector(`label[for="${FIELD_ID}"]`);
    expect(label?.textContent).toBe(M["form.label"]);
    expect(ui.host.querySelector(FIELD)?.hasAttribute("aria-invalid")).toBe(
      false,
    );
    expect(ui.describedBy(FIELD)).toEqual([M["form.hint"]]);
  });

  it("ties the error to the field and announces it, with the text kept", () => {
    const ui = mount();
    ui.show({ kind: "form", text: "nope", error: true });
    const input = ui.host.querySelector<HTMLInputElement>(FIELD);
    expect(input?.value).toBe("nope");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(ui.describedBy(FIELD)).toEqual([M["form.hint"], M["form.error"]]);
    expect(ui.polite()).toBe(M["form.error"]);
  });

  it("submits the field's text by script, not by the browser", () => {
    const ui = mount();
    ui.show({ kind: "form", text: ROUND_ID, error: false });
    const event = new Event("submit", { cancelable: true });
    ui.host.querySelector("form")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(ui.actions.submit).toHaveBeenCalledWith(ROUND_ID);
  });

  it("keeps focus in the field when a submit is refused", () => {
    const ui = mount();
    ui.show({ kind: "form", text: "", error: false });
    ui.host.querySelector<HTMLInputElement>(FIELD)?.focus();
    ui.show({ kind: "form", text: "nope", error: true });
    expect(document.activeElement?.id).toBe(FIELD_ID);
  });

  it("offers the form when the round is not found (V-9)", () => {
    const ui = mount();
    ui.show({ kind: "not-found", roundId: ROUND_ID });
    expect(ui.text()).toContain(ROUND_ID);
    expect(ui.host.querySelectorAll(FIELD)).toHaveLength(1);
  });
});

describe("the report (V-6 to V-8)", () => {
  it("V-6: shows the round id, the shape, the result, and the payout check 7 recomputed", () => {
    const ui = mount();
    ui.show({ kind: "report", report: report({ kind: "matches" }) });
    expect(ui.text()).toContain(ROUND_ID);
    expect(ui.text()).toContain(M["round.shapeOneStep"]);
    expect(ui.text()).toContain(`${M["round.result"]}${M["result.won"]}`);
    expect(ui.text()).toContain(`${M["round.payout"]}€1.94`);
    expect(ui.text()).not.toContain(`€1.94 (${M["check.notChecked"]})`);
  });

  it("V-6: a canceled round shows its reason", () => {
    const ui = mount();
    const canceled = evidence({ status: "canceled", closeReason: "expired" });
    ui.show({
      kind: "report",
      report: report({ kind: "matches" }, { evidence: canceled }),
    });
    expect(ui.text()).toContain(`${M["round.reason"]}expired`);
  });

  it("V-7: names every failed check with both values, and shows no result", () => {
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "mismatch", failed: [3, 5] },
        { checks: checks(failing(3), failing(5)) },
      ),
    });
    const named = [...ui.host.querySelectorAll('[role="alert"] li')].map(
      li => li.textContent,
    );
    expect(named).toEqual(["3. Check 3", "5. Check 5"]);
    const failed = [...ui.host.querySelectorAll(".vp-check--mismatch")].map(
      item => item.textContent,
    );
    expect(failed).toHaveLength(2);
    for (const text of failed) {
      expect(text).toContain(HASH);
      expect(text).toContain(OTHER_HASH);
    }
    expect(ui.text()).not.toContain(M["round.result"]);
    expect(ui.text()).not.toContain("€1.94");
  });

  it("V-7: a chain-only failure names check 6 and shows no result", () => {
    const ui = mount();
    ui.show({ kind: "report", report: report({ kind: "chain-unverified" }) });
    expect(ui.alert()).toContain("6. Check 6");
    expect(ui.text()).not.toContain(M["round.result"]);
  });

  it.each(["voided", "refused"] as const)(
    "V-8: a %s round says so, in plain words, with no check-again control",
    reason => {
      const ui = mount();
      ui.show({
        kind: "report",
        report: report(
          { kind: "not-recomputable", reason },
          { evidence: evidence({ status: "idle", closure: reason }) },
        ),
      });
      expect(ui.text()).toContain(M[`${reason}.heading`]);
      expect(ui.text()).toContain(M[`${reason}.text`]);
      expect(ui.text()).not.toContain(M["action.checkAgain"]);
      expect(ui.text()).not.toContain(M["notEnded.heading"]);
    },
  );

  it("V-8: an unknown kernel version is named", () => {
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "not-recomputable", reason: "unknown-kernel" },
        { evidence: evidence({ kernelVersion: 7 }) },
      ),
    });
    expect(ui.text()).toContain(`${M["unknownKernel.text"]} 7`);
  });

  it("V-8: an unsupported shape says so and shows no shape row", () => {
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "not-recomputable", reason: "unsupported-shape" },
        {
          evidence: evidence({
            terms: [
              { options: 2, losers: 1, next: [1] },
              { options: 2, losers: 1, next: [] },
            ],
            steps: [
              { optionCount: 2, selectedIndex: 1, losingIndex: 0 },
              { optionCount: 2, selectedIndex: 0, losingIndex: 1 },
            ],
          }),
        },
      ),
    });
    expect(ui.text()).toContain(M["unsupportedShape.text"]);
    expect(ui.text()).not.toContain(M["round.shapeOneStep"]);
  });

  it("shows the development indicator beside check 6, not dismissable", () => {
    const degraded: CheckResult = {
      id: 6,
      title: "Check 6",
      status: "matches",
      comparisons: [],
      degraded: true,
    };
    const ui = mount();
    ui.show({
      kind: "report",
      report: report({ kind: "matches" }, { checks: checks(degraded) }),
    });
    const indicator = ui.host.querySelector(".vp-degraded");
    expect(indicator?.textContent).toContain(M["check.degraded"]);
    expect(indicator?.closest("li")?.textContent).toContain("6. Check 6");
    expect(indicator?.querySelectorAll("button")).toHaveLength(0);
  });

  it("labels a check it did not run as not checked, with the reason", () => {
    const skipped: CheckResult = {
      id: 5,
      title: "Check 5",
      status: "not-checked",
      comparisons: [],
      note: "A canceled round is not guaranteed to carry its reveals.",
    };
    const ui = mount();
    ui.show({
      kind: "report",
      report: report({ kind: "matches" }, { checks: checks(skipped) }),
    });
    const item = ui.host.querySelector(".vp-check--not-checked");
    expect(item?.textContent).toContain(`5. Check 5: ${M["check.notChecked"]}`);
    expect(item?.textContent).toContain("not guaranteed");
  });
});

describe("shown, not checked (V-13)", () => {
  it("shows links and proofs from the API as text, labelled not checked", () => {
    const link = 'https://explorer.example/tx/1"><img src=x onerror=alert(1)>';
    const base = evidence();
    const proof = base.randomnessProof as RandomnessProofEvidence;
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "matches" },
        {
          evidence: evidence({
            randomnessProof: {
              ...proof,
              blockExplorerUrl: link,
              zkProof: {
                status: "verified",
                verifiedBy: "superengine",
                proofLink: link,
              },
            },
            record: { chainId: 8453, txHash: HASH, explorerUrl: link },
          }),
        },
      ),
    });
    expect(ui.text()).toContain(M["notChecked.heading"]);
    expect(ui.text()).toContain(link);
    expect(ui.text()).toContain("superengine");
    expect(ui.text()).toContain("8453");
    expect(ui.host.querySelectorAll("a, img")).toHaveLength(0);
  });

  it("lists the action key and the payout terms hash as not checked (A-4)", () => {
    const actionKey = "0x2222222222222222222222222222222222222222";
    const ui = mount();
    ui.show({
      kind: "report",
      report: report(
        { kind: "matches" },
        {
          evidence: evidence({
            createRoundAuth: {
              newRound: {
                roundId: HASH,
                playerRef: "player",
                currency: "EUR",
                betAmount: 100n,
                gameId: 1,
                gameVersion: 1,
                circuitVersion: 1,
                roundSecretHash: HASH,
                randomnessTarget: HASH,
                actionKey,
                payoutTermsHash: OTHER_HASH,
              },
              entropyChainId: 1,
              prepareWindow: 1,
              expiry: "2026-01-01T00:00:00Z",
              domain: {
                chainId: 1,
                verifyingContract: actionKey,
              },
              signer: actionKey,
              signature: "0x",
            },
          }),
        },
      ),
    });
    expect(ui.text()).toContain(`${M["notChecked.actionKey"]}${actionKey}`);
    expect(ui.text()).toContain(
      `${M["notChecked.payoutTermsHash"]}${OTHER_HASH}`,
    );
  });
});
