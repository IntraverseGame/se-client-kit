// T-46, W-48's catalogue holds every text of the wallet delegation (W-64,
// W-65, W-69, W-71, W-72): the menu's entry, the dialog, each failure reason's
// label, the refusal's line, its codes' labels and its controls, and the
// round receipt's `delegation` reason. Each is non-empty, none names a
// machine code, and a session language with no catalogue falls back to
// English. The texts are staging drafts, kept exactly as the spec writes them.

import { describe, expect, it } from "vitest";

import {
  type DelegationMessageKey,
  EN_DELEGATION,
  shortAddress,
} from "./delegation-messages.ts";
import { type MessageKey, messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

/** The spec's English texts (W-64, W-65, W-69, W-71), as written there. */
const SPEC: Readonly<Record<DelegationMessageKey, string>> = {
  "delegation.link": "Link a wallet",
  "delegation.signingOpen": "Signing window open",
  "delegation.linkedLine": "Wallet linked for this session",
  "delegation.heading": "Link a wallet to this session",
  "delegation.whatItSigns":
    "Your wallet signs one statement: that the moves this game session's key signs are yours. It gives no access to your funds and sends no transaction.",
  "delegation.public":
    "The link is public: your wallet's address is published with the evidence of every round you play in this session.",
  "delegation.eachSession":
    "You sign again in each new session. Nothing is stored.",
  "delegation.window":
    "A new window opens on a separate SuperEngine page, where you choose your wallet. Your wallet shows the text below and may name a network: nothing is sent to any chain.",
  "delegation.noticeIntro": "The text your wallet will sign (in English):",
  "delegation.pending": "Pending legal review",
  "delegation.confirm": "Open the signing window",
  "delegation.notNow": "Not now",
  "delegation.linked":
    "Wallet linked. Every round you start in this session carries the link.",
  "delegation.playOn": "You can play on without a wallet.",
  "delegation.signAgain": "Sign again",
  "delegation.continueWithout": "Continue without",
  "delegation.continueWithoutWallet": "Continue without a wallet",
  "delegation.failed.blocked":
    "The signing window could not connect. Close it if it opened.",
  "delegation.failed.no-ready":
    "The signing window could not connect. Close it if it opened.",
  "delegation.failed.no-wallet": "No browser wallet was found.",
  "delegation.failed.rejected": "You declined the signature in your wallet.",
  "delegation.failed.unknown-notice":
    "The signing window could not use this request.",
  "delegation.failed.invalid-request":
    "The signing window could not use this request.",
  "delegation.failed.wallet-error": "Your wallet reported an error.",
  "delegation.failed.wallet-mismatch":
    "The signature did not come from the wallet that was named.",
};

/** The refusal's texts and the receipt's reason, from the other catalogues. */
const OTHERS: readonly (readonly [MessageKey, string])[] = [
  [
    "error.keyDelegationRefused",
    "Your wallet link was refused, and the round did not start.",
  ],
  ["error.KEY_DELEGATION_INVALID", "The wallet's signature was not accepted."],
  ["error.KEY_DELEGATION_EXPIRED", "The wallet link has expired."],
  [
    "error.KEY_DELEGATION_NOTICE_UNKNOWN",
    "The signed text is not accepted here.",
  ],
  [
    "fail.delegation",
    "The wallet link in this round's evidence does not match.",
  ],
];

describe("W-48's catalogue and the wallet delegation (T-46)", () => {
  it("holds every delegation text, as the spec writes it", () => {
    expect(EN_DELEGATION).toEqual(SPEC);
    for (const [key, text] of Object.entries(SPEC)) {
      expect(m[key as MessageKey]).toBe(text);
    }
  });

  it.each(OTHERS)("holds %s", (key, text) => {
    expect(m[key]).toBe(text);
  });

  it("names no machine code in any text", () => {
    const texts = [
      ...Object.values(EN_DELEGATION),
      ...OTHERS.map(([key]) => m[key]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/[A-Z]+_[A-Z_]+|[a-z]+-[a-z]+/u);
      expect(text.trim()).not.toBe("");
    }
  });

  it("falls back to English for a language with no catalogue", () => {
    expect(messagesFor("de").messages["delegation.heading"]).toBe(
      SPEC["delegation.heading"],
    );
  });

  it("shortens a wallet to its first six and last four characters, lowercase", () => {
    expect(shortAddress("0xAbCdEf0000000000000000000000000000001234")).toBe(
      "0xabcd\u20261234",
    );
  });
});
