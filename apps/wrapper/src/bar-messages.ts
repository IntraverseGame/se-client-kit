// The texts of the control bar, version 2 (RFC-005, W-48): the stepper, the
// start control and autoplay, the fairness chip and its popover, the menu and
// the session summary. Per language, like messages.ts, whose catalogue they
// join. The chip's words claim only what the shell checked (W-59): never
// "Verified" or "Provably fair".

export type BarMessageKey =
  | "bar.label"
  | "bet.lower"
  | "bet.raise"
  | "bet.min"
  | "bet.max"
  | "bet.minLabel"
  | "bet.maxLabel"
  | "start.shortcut"
  | "start.pickPrompt"
  | "start.pickDetail"
  | "autoplay.open"
  | "autoplay.heading"
  | "autoplay.count"
  | "autoplay.hint"
  | "autoplay.stop"
  | "autoplay.status"
  | "autoplay.started"
  | "autoplay.stopped"
  | "menu.open"
  | "menu.session"
  | "menu.time"
  | "menu.minutes"
  | "menu.underMinute"
  | "menu.rounds"
  | "chip.how"
  | "chip.checking"
  | "chip.checked"
  | "chip.dev"
  | "chip.notVerified"
  | "chip.recorded"
  | "chip.openLabel"
  | "pop.how"
  | "pop.howConfig"
  | "pop.howKey"
  | "pop.howBook"
  | "pop.howBookVerify"
  | "pop.checking"
  | "pop.checked"
  | "pop.checkRound"
  | "pop.checkKey"
  | "pop.checkBet"
  | "pop.checkSecret"
  | "pop.checkChain"
  | "pop.checkTarget"
  | "pop.checkSigner"
  | "pop.checkReady"
  | "pop.checkTip"
  | "pop.checkTipDev"
  | "pop.passed"
  | "pop.pending"
  | "pop.notCovered"
  | "pop.notReady"
  | "pop.notOnChain"
  | "pop.notTerms"
  | "pop.notExpiry"
  | "pop.notOutcome"
  | "pop.failed"
  | "pop.failedChain"
  | "pop.failedBy"
  | "pop.recorded"
  | "pop.recordedRecord"
  | "pop.recordedDraw"
  | "fail.missing"
  | "fail.pinned-mismatch"
  | "fail.cross-field"
  | "fail.recover-mismatch"
  | "fail.ready-mismatch"
  | "fail.reissued"
  | "fail.tip-check"
  | "fail.changed"
  | "fail.unknown"
  | "tip.unknown-source"
  | "tip.too-few-answered"
  | "tip.chain-id-unavailable"
  | "tip.chain-id-mismatch"
  | "tip.lagging"
  | "tip.hash-unavailable"
  | "tip.hash-mismatch"
  | "tip.bind";

export type BarMessages = Readonly<Record<BarMessageKey, string>>;

export const EN_BAR: BarMessages = {
  "bar.label": "Game controls",
  "bet.lower": "Lower bet",
  "bet.raise": "Raise bet",
  "bet.min": "MIN",
  "bet.max": "MAX",
  "bet.minLabel": "Lowest bet",
  "bet.maxLabel": "Highest bet you can place",
  "start.shortcut": "Shortcut: Space, while the bar has the focus",
  "start.pickPrompt": "Make your pick",
  "start.pickDetail": "Make your pick in the game.",
  "autoplay.open": "Autoplay",
  "autoplay.heading": "Autoplay",
  "autoplay.count": "rounds",
  "autoplay.hint":
    "Stops on any error, a connection problem, a round that changed, when the balance can't cover the bet, or when you leave this page.",
  "autoplay.stop": "Stop autoplay",
  "autoplay.status": "Autoplay · {n} left",
  "autoplay.started": "Autoplay started",
  "autoplay.stopped": "Autoplay stopped",
  "menu.open": "Menu",
  "menu.session": "This session",
  "menu.time": "Time",
  "menu.minutes": "{n} min",
  "menu.underMinute": "under 1 min",
  "menu.rounds": "Rounds",
  "chip.how": "How it's checked",
  "chip.checking": "Checking",
  "chip.checked": "Checked before play",
  "chip.dev": "Checked (dev)",
  "chip.notVerified": "Not verified",
  "chip.recorded": "Recorded",
  "chip.openLabel": "show what was checked",
  "pop.how": "How it's checked",
  "pop.howConfig":
    "Each round is checked here, in your browser, before you can play it: the checks below, against values this page was set up with.",
  "pop.howKey":
    "Your moves are signed with a key made in this tab. It never leaves it.",
  "pop.howBook":
    "Each round's randomness record is checked in your browser to stay the same from its start to its result.",
  "pop.howBookVerify":
    "Checking the draw itself is the verify page's job, not yet available for this game.",
  "pop.checking": "Checking this round",
  "pop.checked": "Checked in your browser before play",
  "pop.checkRound": "The round's authorization names this round",
  "pop.checkKey": "It is bound to your key, made in this tab",
  "pop.checkBet": "It is for your bet and currency",
  "pop.checkSecret": "It commits to the round's secret",
  "pop.checkChain": "Its randomness comes from the pinned chain",
  "pop.checkTarget": "Its randomness target is the round's",
  "pop.checkSigner": "It is signed by the pinned signer, for the pinned domain",
  "pop.checkReady": "The round's ready evidence matches",
  "pop.checkTip": "The chain's tip, from independent providers",
  "pop.checkTipDev": "The chain's tip, from one endpoint only (development)",
  "pop.passed": "passed",
  "pop.pending": "being checked",
  "pop.notCovered": "Not covered by these checks",
  "pop.notReady":
    "The ready evidence is taken from the round's state as given until it is anchored.",
  "pop.notOnChain":
    "The domain, the signer, and the authorization are not yet checked on-chain.",
  "pop.notTerms":
    "The player, game, versions, and payout terms in the authorization are taken as signed.",
  "pop.notExpiry": "The round's expiry and preparation window are not checked.",
  "pop.notOutcome":
    "The outcome is not checked here: that is the verify page's job.",
  "pop.failed": "This round failed verification",
  "pop.failedChain": "Could not verify the chain",
  "pop.failedBy": "What refused it",
  "pop.recorded": "What was checked",
  "pop.recordedRecord":
    "The round's randomness record stayed the same from its start to its result.",
  "pop.recordedDraw":
    "Checking the draw is the verify page's job, not yet available for this game.",
  "fail.missing": "The round's authorization or a value it needs was missing.",
  "fail.pinned-mismatch":
    "The authorization's signer or domain is not the pinned one.",
  "fail.cross-field":
    "The authorization does not match this round, your key, your bet, or its randomness.",
  "fail.recover-mismatch":
    "The authorization's signature is not the pinned signer's.",
  "fail.ready-mismatch": "The round's ready evidence does not match.",
  "fail.reissued": "The round's authorization changed after it was checked.",
  "fail.tip-check": "The chain check failed.",
  "fail.changed": "The round's randomness record changed during the round.",
  "fail.unknown": "A check failed.",
  "tip.unknown-source": "No endpoint is set up for the round's chain.",
  "tip.too-few-answered": "Too few chain endpoints answered.",
  "tip.chain-id-unavailable": "A chain endpoint gave no chain id.",
  "tip.chain-id-mismatch": "A chain endpoint is on another chain.",
  "tip.lagging": "A chain endpoint is too far behind.",
  "tip.hash-unavailable": "A chain endpoint gave no block hash.",
  "tip.hash-mismatch": "The chain endpoints disagree.",
  "tip.bind": "The round's randomness block does not fit the chain's tip.",
};

/** A text with its `{n}` replaced by `n`, as text. */
export const withCount = (text: string, n: number): string =>
  text.replace("{n}", String(n));
