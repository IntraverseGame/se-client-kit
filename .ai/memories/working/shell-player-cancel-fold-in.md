---
description: Folding the cancel's settling states (#41) into the Wrapper session (#58) after the rebase
owner: client-kit maintainers
status: active
related: feat/shell-player-cancel, issue #41, PR #58
created: 2026-10-18
---

# Fold the cancel states into the Wrapper session

## Context

`feat/shell-player-cancel` (#41) now sits on `main` c915675, with the Wrapper
session (#58), the cc0d944 contracts (#59), and the b27afc5 contracts (#60)
under it; the rebase is done (its conflicts resolved, the vector tests pass,
#60's `TODO(#41)` markers deleted). What remains is the fold-in below, its own
step. It follows the Snapshot contract `se.snapshot/1` as vendored from the
backend's b27afc5 (#60): `canceled` is final, and a cancel the
engine has not answered shows `resolving`. It gives the round flow's cancel
the states `in-flight`, `settling`, `check-later`, `ended`, and `not-taken`
(W-25, W-33, W-35; `packages/shell/src/cancel-state.ts`), holds back every
Snapshot of the round from elsewhere while the cancel is `in-flight`,
`settling`, or `check-later` (the flow's `observe`), and adds the flow's
counted reads (`refresh`, `checkAgain`), and keeps cancel refusals in the
evidence (`cancelRefusals`). #58's session and Wrapper do not know
these states yet. Delete this file once the fold-in below is merged.

## Findings / hypotheses

**Interim behavior on main.** Between #41 merging and the fold-in, the
production Wrapper signs the required `PlayerCancel`, but #58's session does
not know the cancel states yet:

- `see()` still sets `shown` and forwards the round's Snapshot to the game,
  including one the round flow holds back while the cancel is `in-flight`,
  `settling`, or `check-later`;
- `holdsOpenRound` can release (so a new round may start) on an `idle` or
  another round's read while the cancel is settling;
- the Wrapper's poll does not run while the round shows `active`, so a
  `settling` cancel at `active` is not read again until something else reads.

**Release hold (decided by human review, 2026-10-18).** No release (the
changesets version PR) goes out until the fold-in merges.

The fold-in checklist (on `main`, after the rebase):

- **`round-flow.ts` `over()`** (#58: `isRoundOver(tracking.latest())`): `true`
  for `ended`; `false` while `in-flight`, `settling`, or `check-later`;
  otherwise as now (`not-taken` follows the latest Snapshot, `active`).
- **`session-play.ts` `holdsOpenRound`** (what `round-exists` keys on): `true`
  while the cancel is `in-flight`, `settling`, or `check-later`, whatever
  `shown` holds (`idle` and another round included); `false` for `ended`.
- **`session-play.ts` `see()`**: while the cancel is `in-flight`, `settling`,
  or `check-later`, do not forward a Snapshot of the round to
  `bridge.sendSnapshot` and do not set `shown` to it; the UI and the game get
  `current.latest()`.
- **`session-play.ts` `read()`**: while `settling`, read through the flow's
  counted read (`current.refresh()`), and from `check-later` through
  `current.checkAgain()`, never `reader.read()` plus `current.observe` (the gate
  drops those). Pass an `idle` read on normally once the state is `ended`.
- **`settle()` / `SessionRead`**: expose the cancel state (`settling`,
  `check-later`, `ended`, `not-taken`) to the UI, and the check-again use case.
- **Wrapper `round-input.ts` `isPolled` and the poller's `follow()`**: take the
  cancel state. Poll while `settling`, even when the latest status is
  `active`; in `check-later` no fast poll, only the 30 s background read from
  the Wrapper's injected timers (and the player's "check again"); stop in
  `ended`, `not-taken`, and `sent` (a final `canceled`, `won`, or `lost`).
- **Wrapper views (W-33)**: `in-flight` and `settling` show the round as before
  the cancel (failed verification, inputs disabled on a `resolving` read);
  `check-later` shows "still resolving — contact support", the round id, the
  verify link, and "check again" (the message copy lands here); `ended` shows a
  neutral "round ended" with no result claim, and a new round may start;
  `not-taken` shows failed verification; a final `canceled` shows "this round
  failed verification and was canceled" (W-26).
- **The stale comment in `packages/shell/src/play-session.ts`** (in
  `openPlaySession`, where the signing session is opened): remove "No
  `PlayerCancel` encoding until its independent vector (#41): the required
  cancel is `unavailable` and nothing is signed for it (W-25)." Nothing is
  passed there, and the cancel is signed.
- **No cancel left unread**: closed in the shell. `unconfirmed` is gone; a
  failed read after an unknown outcome or a 422, and an unknown outcome with an `active` read with no move when no resend is
  allowed (after the resend, or after a re-issue), are `settling`. The terminal states and what
  reads them: `sent`, `ended` (final, nothing to read); `not-taken`,
  `refused`, `unavailable` (no cancel stored; the round ends by its expiry
  rule, read as any `active` round is); `settling` (the Wrapper's poll through
  `refresh`); `check-later` (`checkAgain` and the 30 s background read). The
  Wrapper must poll `settling` even at `active`.
- **Fold-in test**: through `session-play`, picks and the cash-out are refused
  while the cancel is `in-flight` (and `settling`, `check-later`).
- **Done in the rebase (no longer to do)**: #60's `TODO(#41)` markers in
  W-25, W-35, and the shell spec are deleted; the vector tests run against
  #59's `signedAction` and #60's `valid/coinflip-resolving-cancel` exports and
  pass; `isRoundOver`'s comment and the specs no longer say `canceled` with no
  `closeReason` is not final; the conflicts in `round-flow.ts`,
  `round-guards.test.ts`, and five specs are resolved. `over()` is still
  `isRoundOver(latest)` only (first item above).

## Open questions

- Whether the Wrapper's `ended` message key lands with the fold-in or before.

## To promote on resolution

- The Wrapper's session and polling rules into `specs/wrapper/` (W-33, W-35)
  and `specs/client-kit/the-shell-package.md`, if the fold-in changes them.
- Nothing else is durable here: delete this file when the fold-in merges.
