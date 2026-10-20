// The page's text (V-4 to V-14). The page is in English, the Wrapper's
// fallback language, in the first release: it has no session to take a
// language from (V-14). Every string is plain text; values from the network
// are added beside it as text nodes, never interpolated into markup.

export const MESSAGES = {
  "page.title": "Verify a round",

  "starting.heading": "Starting",
  "starting.text": "Reading this page's configuration.",

  "configError.heading": "This page is not configured correctly",
  "configError.text":
    "The verify page could not read a valid configuration, so it checked nothing and sent no request.",
  "configError.retryText":
    "The verify page could not load its configuration, so it checked nothing. Check your connection, then try again.",

  "form.heading": "Verify a round",
  "form.intro":
    "Paste a round id to recompute the round in your browser from its public evidence.",
  "form.label": "Round id",
  "form.hint": "A round id looks like 01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d.",
  "form.error": "This is not a round id.",
  "form.submit": "Verify",

  "loading.heading": "Checking this round",
  "loading.text": "Checking this round.",

  "matches.heading": "This round matches its evidence",
  "matches.text":
    "Every check that applies to this round was recomputed in your browser and matches.",

  "mismatch.heading": "This round does not match its evidence",
  "mismatch.text":
    "At least one check failed, so no result of this round is established. The failed checks are:",

  "chainUnverified.heading":
    "This round could not be verified against the chain",
  "chainUnverified.text":
    "The entropy chain could not be read well enough to check block N, so no result of this round is established.",

  "notEnded.heading": "This round has not ended yet",
  "notEnded.text":
    "The checks below are what could be checked so far. The rest waits for the round's end.",

  "unknownKernel.heading": "This round cannot be recomputed",
  "unknownKernel.text":
    "This page cannot recompute rounds of this kernel version. Nothing was derived for it. Kernel version:",

  "unsupportedShape.heading": "This round cannot be recomputed",
  "unsupportedShape.text":
    "This page recomputes rounds of one step with two options only. The checks below are what could be checked.",

  "notFound.heading": "Round not found",
  "notFound.text": "The verification service has no round with this id:",

  "apiError.heading": "The verification service could not answer",
  "apiError.text":
    "The verification service answered with an error or an answer this page cannot read. Nothing is claimed about this round.",

  "unreachable.heading": "The verification service could not be reached",
  "unreachable.text":
    "No answer came from the verification service. Nothing is claimed about this round.",
  "unreachable.offline":
    "Your browser reports that it is offline. Check your connection, then try again.",

  "action.checkAgain": "Check again",
  "action.tryAgain": "Try again",
  "action.copy": "Copy",
  "action.copied": "Copied.",

  "round.id": "Round id",
  "round.shape": "Round",
  "round.shapeOneStep": "one step, two options",
  "round.result": "Result",
  "round.reason": "Reason",
  "round.payout": "Payout",
  "round.kernelVersion": "Kernel version",

  "result.won": "won",
  "result.lost": "lost",
  "result.canceled": "canceled",

  "checks.heading": "Checks",
  "checks.recomputed": "recomputed",
  "checks.evidence": "evidence",
  "checks.absent": "absent",
  "check.matches": "matches",
  "check.mismatch": "does not match",
  "check.unverified": "could not be verified",
  "check.notChecked": "not checked",
  "check.degraded": "Chain check not independent (development).",

  "notChecked.heading": "Not checked by this page",
  "notChecked.text":
    "These values are shown as the verification service gave them. This page did not check them, and links from the service are shown as text, not followed.",
  "notChecked.payout": "Payout amount",
  "notChecked.payoutTermsHash": "Payout terms hash (taken as signed)",
  "notChecked.actionKey": "Action key (the round's player key)",
  "notChecked.recordTx": "On-chain record transaction",
  "notChecked.recordChain": "On-chain record chain id",
  "notChecked.recordExplorer": "On-chain record explorer",
  "notChecked.blockExplorer": "Block explorer",
  "notChecked.randomnessZk": "Randomness ZK proof",
  "notChecked.fairnessZk": "Fairness ZK proof",
  "notChecked.verifiedBy": "verified by",
  "notChecked.proofLink": "proof link",

  "icon.matches": "Matches",
  "icon.mismatch": "Does not match",
  "icon.unverified": "Could not be verified",
  "icon.notChecked": "Not checked",
  "icon.error": "Error",
  "icon.info": "Information",
  "icon.progress": "In progress",
} as const;

export type MessageKey = keyof typeof MESSAGES;
