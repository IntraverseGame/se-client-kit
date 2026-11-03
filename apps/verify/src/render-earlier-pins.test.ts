// @vitest-environment jsdom
// VT-4 for V-3b: a round that passes check 3 under an earlier pair reaches the
// same heading as any other, and the check says so and names the pair as text.

import { describe, expect, it } from "vitest";

import type { CheckResult } from "./check-result.ts";
import { checks, report } from "./fixtures/page.ts";
import { mount } from "./fixtures/render.ts";
import { MESSAGES as M } from "./messages.ts";

const MARKUP = '<img src=x onerror="alert(1)">';

const EARLIER: CheckResult = {
  id: 3,
  title: "Check 3",
  status: "matches",
  comparisons: [],
  note: M["check.earlierSigned"],
  details: [
    { label: M["check.earlierChainId"], value: "127" },
    { label: M["check.earlierContract"], value: "0xcontract" },
    { label: M["check.earlierSigner"], value: MARKUP },
  ],
};

const shown = () => {
  const ui = mount();
  ui.show({
    kind: "report",
    report: report({ kind: "matches" }, { checks: checks(EARLIER) }),
  });
  const item = [...ui.host.querySelectorAll(".vp-check--matches")].find(
    element => element.textContent.includes("3. Check 3"),
  );
  return { ui, item };
};

describe("check 3 under an earlier pair", () => {
  it("keeps the verdict's heading", () => {
    expect(shown().ui.heading()).toBe(M["matches.heading"]);
  });

  it("says so in the check, in a paragraph", () => {
    expect(shown().item?.querySelector("p")?.textContent).toBe(
      M["check.earlierSigned"],
    );
  });

  it.each([
    M["check.earlierChainId"],
    "127",
    M["check.earlierContract"],
    "0xcontract",
    M["check.earlierSigner"],
  ])("names %s in the check's rows", text => {
    expect(shown().item?.querySelector("dl")?.textContent).toContain(text);
  });

  it("renders a configured value as text", () => {
    const { item } = shown();
    expect(item?.querySelector("dl")?.textContent).toContain(MARKUP);
    expect(item?.querySelector("img")).toBeNull();
  });
});
