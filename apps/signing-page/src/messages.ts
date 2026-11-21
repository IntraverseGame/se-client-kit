// The page's texts (specs/signing-page.md, SP-10), in English: staging drafts
// (decided by the human, 2026-11-20), used on staging as written and reviewed
// before production offers the delegation. The notice itself is the backend's
// and is never reworded; it is never in this catalogue.

export const TEXT = Object.freeze({
  lost: "This window lost its connection to the game. Close it.",
  configError:
    "This page could not load its settings. Close this window and try again from the game.",
  waitingForGame: "Connecting to the game…",
  timedOut: "Close this window and try again from the game.",
  discovering: "Looking for your browser wallet…",
  chooseHeading: "Link a wallet to your game session",
  signThis: "Your wallet will ask you to sign this text:",
  pending: "Pending legal review",
  lastsUntil: (expiry: string): string => `This link lasts until ${expiry}.`,
  networkName:
    "Your wallet may show a network name: nothing is sent to any chain, and no transaction is made.",
  chooseWallet: "Choose your wallet:",
  confirmInWallet: "Confirm in your wallet…",
  finishing: "Finishing…",
});

/**
 * The expiry, unix seconds, as a date and time in the browser's locale and time
 * zone (the wallet shows raw seconds).
 */
export const formatExpiry = (expiry: number): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(expiry * 1000));
