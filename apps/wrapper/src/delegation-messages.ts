// The wallet delegation's texts (W-64, W-65, W-69, W-71; W-48's catalogue):
// the menu's entry, the consent dialog, the outcomes, and the refusal's two
// controls. Per language, like messages.ts, whose catalogue they join. Every
// text is a staging draft (decided by the human, 2026-11-20): used on staging
// as written, and reviewed before production offers the delegation. The
// notice a wallet signs is never one of them: it is shown in English, exactly
// as the vendored list holds it (W-65). The refused start's line and its codes'
// labels are messages.ts's (`error.keyDelegationRefused`, W-42).

import type { DelegationFailureReason } from "@intraverse/se-client-shell";

export type DelegationMessageKey =
  | "delegation.link"
  | "delegation.signingOpen"
  | "delegation.linkedLine"
  | "delegation.heading"
  | "delegation.whatItSigns"
  | "delegation.public"
  | "delegation.eachSession"
  | "delegation.window"
  | "delegation.noticeIntro"
  | "delegation.pending"
  | "delegation.confirm"
  | "delegation.notNow"
  | "delegation.linked"
  | "delegation.playOn"
  | "delegation.signAgain"
  | "delegation.continueWithout"
  | "delegation.continueWithoutWallet"
  | `delegation.failed.${Exclude<DelegationFailureReason, "session-ended">}`;

export type DelegationMessages = Readonly<Record<DelegationMessageKey, string>>;

const COULD_NOT_CONNECT =
  "The signing window could not connect. Close it if it opened.";
const COULD_NOT_USE = "The signing window could not use this request.";

export const EN_DELEGATION: DelegationMessages = {
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
  "delegation.failed.blocked": COULD_NOT_CONNECT,
  "delegation.failed.no-ready": COULD_NOT_CONNECT,
  "delegation.failed.no-wallet": "No browser wallet was found.",
  "delegation.failed.rejected": "You declined the signature in your wallet.",
  "delegation.failed.unknown-notice": COULD_NOT_USE,
  "delegation.failed.invalid-request": COULD_NOT_USE,
  "delegation.failed.wallet-error": "Your wallet reported an error.",
  "delegation.failed.wallet-mismatch":
    "The signature did not come from the wallet that was named.",
};

/**
 * A wallet's address as the menu's line shows it (W-64): its first six and last
 * four characters, lowercase, joined by an ellipsis.
 */
export const shortAddress = (wallet: string): string => {
  const lower = wallet.toLowerCase();
  return `${lower.slice(0, 6)}\u2026${lower.slice(-4)}`;
};
