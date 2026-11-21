// @vitest-environment jsdom
// VT-16's display (V-22, V-13): check 9 under its heading "Wallet link", with
// the wallet in full, the statement, the notice as text (never markup), its id
// and status in this page's list, the expiry and `acceptedAt` as dates beside
// their unix seconds, each item's comparison, and what the link means; in V-6
// and V-7, with the delegation's values the page cannot check listed apart.

import { describe, expect, it } from "vitest";

import type { CheckResult } from "./check-result.ts";
import { dateAndSeconds } from "./delegation-view.ts";
import { checks, report } from "./fixtures/page.ts";
import { mount } from "./fixtures/render.ts";
import { delegatedBody } from "./fixtures/verify-body.ts";
import { checkKeyDelegation } from "./key-delegation-check.ts";
import { MESSAGES as M } from "./messages.ts";
import type { KeyDelegationEvidence, RoundEvidence } from "./round-evidence.ts";
import { parseEvidence } from "./verify-body.ts";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

const delegatedEvidence = (
  change: Partial<KeyDelegationEvidence> = {},
): RoundEvidence => {
  const evidence = parseEvidence(delegatedBody());
  const delegation = evidence?.keyDelegation;
  if (evidence === undefined || delegation === undefined) {
    throw new TypeError("the body does not validate");
  }
  return { ...evidence, keyDelegation: { ...delegation, ...change } };
};

const check9 = (
  evidence: RoundEvidence,
  notices?: Parameters<typeof checkKeyDelegation>[3],
): CheckResult => {
  const { keyDelegation } = evidence;
  if (keyDelegation === undefined) throw new TypeError("no delegation");
  return checkKeyDelegation(
    keyDelegation,
    evidence.createRoundAuth?.newRound,
    true,
    notices,
  );
};

const shown = (
  evidence: RoundEvidence,
  result?: CheckResult,
  failed = false,
) => {
  const ui = mount();
  ui.show({
    kind: "report",
    report: report(
      failed ? { kind: "mismatch", failed: [9] } : { kind: "matches" },
      {
        evidence,
        checks: [...checks(), ...(result === undefined ? [] : [result])],
      },
    ),
  });
  return ui;
};

/** The texts of the elements under `root` that `selector` names. */
const all = (root: Element | undefined, selector: string): readonly Element[] =>
  root === undefined ? [] : [...root.querySelectorAll(selector)];

const checkItem = (host: HTMLElement): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>(".vp-check")].find(item =>
    item.querySelector("h3")?.textContent.includes("9. Wallet link"),
  );

describe("check 9's display in V-6", () => {
  const evidence = delegatedEvidence();
  const ui = shown(evidence, check9(evidence));
  const item = checkItem(ui.host);

  it("is headed `Wallet link`, matching", () => {
    expect(item?.querySelector("h3")?.textContent).toContain(
      `9. Wallet link: ${M["check.matches"]}`,
    );
  });

  it("shows the wallet in full, with a copy control, and the statement", () => {
    expect(item?.textContent).toContain(M["delegation.statement"]);
    const codes = all(item, "code").map(code => code.textContent);
    expect(codes).toContain(WALLET);
    expect(
      item?.querySelector(
        `button[aria-label="${M["action.copy"]} ${M["delegation.wallet"]}"]`,
      ),
    ).not.toBeNull();
  });

  it("shows the notice's text, its id, and its status in the list", () => {
    expect(item?.querySelector(".vp-notice")?.textContent).toBe(
      evidence.keyDelegation?.notice,
    );
    expect(item?.textContent).toContain(
      `${M["delegation.noticeId"]}en-draft-1`,
    );
    expect(item?.textContent).toContain(`${M["delegation.listed"]}pending`);
  });

  it("shows the expiry and acceptedAt as dates beside their unix seconds", () => {
    expect(item?.textContent).toContain(
      `${M["delegation.expiry"]}${dateAndSeconds(1_795_000_000)}`,
    );
    expect(item?.textContent).toContain(
      `${M["delegation.acceptedAt"]}${dateAndSeconds(1_794_990_000)}`,
    );
    expect(dateAndSeconds(1_795_000_000)).toContain(
      `(1795000000 ${M["delegation.seconds"]})`,
    );
  });

  it("shows each item's comparison, and what the link means and does not", () => {
    const names = all(item, ".vp-comparison__name");
    expect(names).toHaveLength(7);
    expect(names.every(n => n.textContent.endsWith(M["check.matches"]))).toBe(
      true,
    );
    expect(item?.textContent).toContain(M["delegation.means"]);
  });

  it("lists acceptedAt and the session apart, as not checked (V-13)", () => {
    expect(ui.text()).toContain(
      `${M["notChecked.acceptedAt"]}${dateAndSeconds(1_794_990_000)}`,
    );
    expect(ui.text()).toContain(
      `${M["notChecked.session"]}${String(evidence.keyDelegation?.sessionId)}`,
    );
    expect(ui.text()).not.toContain(M["notChecked.noticePublished"]);
  });
});

describe("check 9's display, other cases", () => {
  it("renders a notice's markup as text, never as markup", () => {
    const evidence = delegatedEvidence({ notice: "<b>bold</b> & <script>" });
    const ui = shown(evidence, check9(evidence), true);
    const notice = checkItem(ui.host)?.querySelector(".vp-notice");
    expect(notice?.textContent).toBe("<b>bold</b> & <script>");
    expect(notice?.children).toHaveLength(0);
    expect(ui.host.querySelector("b, script")).toBeNull();
  });

  it("V-7: names check 9 and shows the two values of the failed item", () => {
    const evidence = delegatedEvidence({ acceptedAt: 1_795_000_000 });
    const ui = shown(evidence, check9(evidence), true);
    expect(ui.alert()).toContain("9. Wallet link");
    const item = checkItem(ui.host);
    expect(item?.querySelector("h3")?.textContent).toContain(
      M["check.mismatch"],
    );
    const failed = item?.querySelector(".vp-comparison--mismatch");
    expect(failed?.textContent).toContain(M["delegation.expiryAfter"]);
    expect(failed?.textContent).toContain("1795000000");
  });

  it("shows a notice not in the list as not checked, and lists it apart", () => {
    const evidence = delegatedEvidence();
    const ui = shown(evidence, check9(evidence, []));
    const item = checkItem(ui.host);
    expect(item?.textContent).toContain(
      `${M["delegation.listed"]}${M["delegation.unlisted"]}`,
    );
    expect(item?.textContent).toContain(M["delegation.unlistedItem"]);
    expect(ui.text()).toContain(
      `${M["notChecked.noticePublished"]}${M["check.notChecked"]}`,
    );
  });

  it("shows only the seconds past the dates a `Date` holds", () => {
    expect(dateAndSeconds(Number.MAX_SAFE_INTEGER)).toBe(
      `${String(Number.MAX_SAFE_INTEGER)} ${M["delegation.seconds"]}`,
    );
  });

  it("shows no wallet link for a round without a delegation", () => {
    const evidence = delegatedEvidence();
    const ui = shown({ ...evidence, keyDelegation: undefined });
    expect(checkItem(ui.host)).toBeUndefined();
    expect(ui.text()).not.toContain(M["delegation.statement"]);
    expect(ui.text()).not.toContain(M["notChecked.session"]);
  });
});
