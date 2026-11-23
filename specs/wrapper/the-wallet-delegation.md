# The wallet delegation

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

A player who opts in signs, once per session and with their browser wallet, a
`KeyDelegation`: a statement that the shell's own action key acts for that
wallet in this session. The shell sends it with every start of the session, and
the round's evidence then names the wallet. The design was decided by the human
on 2026-11-17 and accepted with the specs on 2026-11-20
([RFC-006](../../rfcs/archived/RFC-006-wallet-delegated-action-key.md),
archived;
[ADR-012](../../decisions/ADR-012-the-signing-page-on-its-own-origin.md),
accepted). The wallet itself is reached only from the signing page, on its own
origin ([Signing page](../signing-page.md)); the Wrapper has no wallet code and
never holds a wallet connection. The typed data, its digest, the recovery of the
wallet's signature, and the notice list's reader are `signing`'s
([The cryptography](../client-kit/the-cryptography.md)); the contract is the
backend's published `key-delegation/v1`, vendored in `contracts`
([How the kit gets its contracts](../client-kit/how-the-kit-gets-its-contracts.md)).

A player-supplied key (a key the player imports) stays out of scope.

## Opt-in, and where it is offered

- **W-62. Opt-in, and production today.** Delegation is optional. A player
  without a wallet, or who declines, plays exactly as before, on the shell's
  key. The Wrapper offers it only when the build holds an accepted notice for
  its environment (W-63) **and** the environment configuration names the signing
  page (`signingPageOrigin`, [Configuration](../wrapper.md#configuration);
  without it nothing is offered: fail closed). **Production today:** the only
  notice in the backend's published list is `en-draft-1`, with status `pending`
  (its text waits for the backend's legal review), and a production document may
  not accept a pending notice (`acceptPendingNotices` is refused there, W-63).
  So a production build of this kit holds all the delegation code and offers no
  menu entry, opens no window, and sends no `keyDelegation`: it plays exactly as
  before this change. It offers the entry only once a kit release vendors a list
  with an `approved` notice, and the environment's `signingPageOrigin` is set
  (the release runbook,
  [Turning on the wallet delegation](../../runbook/client-kit-release.md#turning-on-the-wallet-delegation)).
  An environment's `signingPageOrigin` is set only once that environment's
  backend accepts `keyDelegation` on a start (RFC-006, Migration; the backend's
  published rollout rule).
- **W-63. Which notice.** The shell reads the notices, their status, and their
  `keccak256` (the delegation's `noticeHash`) from `contracts`' runtime entry,
  through `signing`'s notice reader, never from the network. It offers the most
  recent `approved` notice: the last `approved` entry in the list's order. The
  order is part of the `key-delegation/v1` contract: a new notice goes at the
  end of the list and no entry ever moves, so the list's order is publication
  order. The backend's own append-only check refuses a reordered list or an
  insert before the end (the kit's sync matches the notices by `id` and adds no
  order check of its own). Only when no entry is `approved`, and the
  configuration's `acceptPendingNotices` is `true`, it offers the most recent
  `pending` one instead. It never offers a `retired` one. The configuration's
  validator refuses `acceptPendingNotices: true` with
  `environment: "production"` (`pending-notices-in-production`), so production
  never offers a pending notice, whatever its list holds; the shell relies on
  that validated configuration and does not check it again. With no notice to
  offer, no entry is offered. The notice is chosen once, when the session opens,
  and kept for the session.
- **W-64. The menu entry.** The bar's menu (W-57) holds one more item, **"Link a
  wallet"**, offered only when all of these hold, and otherwise absent (not
  disabled):
  1. the shell offers it: a notice exists (W-63), `signingPageOrigin` is
     configured, the session is open, the delegation's state is `offered`,
     `declined`, `failed`, or `refused` (W-69; in `refused` the item is W-71's
     "Sign again" too), and no round is open (the shell would let a start
     through: no round held, or the held one over, and no cancel in `in-flight`,
     `settling`, or `check-later`, W-25);

  2. the game is not a book game: the latest Snapshot is not `playback` (the
     test autoplay's `not-book` uses). The backend refuses a book start that
     carries a delegation;
  3. `matchMedia("(pointer: fine)")` and `matchMedia("(hover: hover)")` both
     match, read when the menu opens: desktop only, since the popup and the
     browser wallet are a desktop flow. This condition gates "Link a wallet"
     only (decided by the human, 2026-11-21): "Signing window open" and the
     linked line below show whatever the two queries say, since they report a
     window or a link that already exists;
  4. the dialog and the window are not already open: while the state is
     `signing`, the item reads **"Signing window open"** and, when chosen,
     focuses that window (`focus()` on its handle) rather than opening another
     (one window at a time).

  While the state is `registered`, the menu shows, in place of the item, the
  line **"Wallet linked for this session"** with the wallet's address shortened
  to its first six and last four characters (`0x1234…abcd`, lowercase), as text,
  not a control. The address is public (it is published with every delegated
  round), so it may be shown; it is never logged or stored (W-73).

## The consent dialog

- **W-65. The dialog.** Choosing "Link a wallet" opens a modal dialog (an HTML
  `<dialog>` opened with `showModal()`, so the rest of the page, the game frame
  included, is inert while it is open). It explains, in the session's language
  (W-48; English is the fallback), what the player signs and what it allows, and
  then shows the exact English notice text that will be signed. Its texts, in
  English, are **staging drafts** (decided by the human, 2026-11-20): they are
  used on staging as written, and reviewed before production offers the
  delegation (the release runbook's precondition for production's
  `PAGES_SIGNER_ORIGIN`); the review may change them, never the notice, which is
  the backend's:
  - heading: "Link a wallet to this session";
  - "Your wallet signs one statement: that the moves this game session's key
    signs are yours. It gives no access to your funds and sends no
    transaction.";
  - "The link is public: your wallet's address is published with the evidence of
    every round you play in this session.";
  - "You sign again in each new session. Nothing is stored.";
  - "A new window opens on a separate SuperEngine page, where you choose your
    wallet. Your wallet shows the text below and may name a network: nothing is
    sent to any chain.";
  - "The text your wallet will sign (in English):", then the notice's text,
    exactly as the list holds it, in a block of its own (as text, never as
    markup, with no change of whitespace or case). While the notice is `pending`
    the block is marked **"Pending legal review"** (the backend owns that
    review);
  - two controls: **"Open the signing window"** (the confirm) and **"Not now"**.

  The notice's text is always shown in English, whatever the session's language:
  it is the exact bytes the wallet signs, and the first increment has English
  notices only. The other texts follow W-48's catalogue. This spec gives
  behavior, texts, and accessibility; the look follows the Wrapper's one dark
  theme (W-47, [The single screen](./the-single-screen.md)) until a designed
  dialog replaces it (se-client-kit#256, a follow-up change).

  **Accessibility.** The dialog is labelled by its heading (`aria-labelledby`)
  and described by its first paragraph (`aria-describedby`). Opening it moves
  the focus to its heading (focusable by script only, `tabindex="-1"`), so a
  screen reader reads the explanation before any control. Tab moves through the
  notice block's scroll region when it scrolls, then the two controls, and stays
  in the dialog (the native modal dialog's behavior). Escape is "Not now".
  Closing the dialog, by either control or by Escape, returns the focus to the
  menu's button. Its text keeps W-47's contrast, and its controls W-47's 24 by
  24 CSS pixel minimum.

## Opening the signing window

- **W-66. Under the click.** In the confirm control's `click` handler,
  synchronously, with no `await` before it, the Wrapper:
  1. closes the dialog;
  2. calls `window.open(url, "_blank", "popup,width=480,height=720")`, where
     `url` is `signingPageOrigin` plus `/`, with no query and no fragment, so it
     runs under the click's transient user activation. The window is unnamed, so
     the operator page cannot reach it by name, and it is opened without
     `noopener`: the Wrapper keeps the returned handle;
  3. hands the handle (or `null`) to the shell's delegation use case (`begin`,
     [the `shell` package](../client-kit/the-shell-package.md)).

  Steps 2 and 3, and the third route of W-67 for the attempt, are the Wrapper's
  `openSigningWindow` (`apps/wrapper/src/signing-window.ts`, slice S5), which
  the confirm's handler calls (S6: `delegation-wiring.ts`, with the dialog in
  `consent-dialog.ts`, the menu's entry in `bar-menu.ts`, and W-69's and W-71's
  alert in `delegation-alert.ts`).
  - **`null` is blocked.** A `null` return is a blocked window, whether a popup
    blocker or the operator page's opener policy (W-49g) caused it: the state
    becomes `failed` with the reason `blocked`, the player is told the signing
    window could not connect (and to close it if it opened, W-69), and play goes
    on undelegated. Under the operator's COOP `same-origin` the window may still
    open, with no `window.opener`; the signing page then does nothing
    ([Signing page](../signing-page.md), SP-4).
  - **The wait for `ready`.** The shell waits 10 s, on its injected clock, for
    the first valid `ready` from the window (the same wait as the operator
    handshake, W-49c). With none in time it posts nothing, closes the window
    (`close()` on its handle), and the state becomes `failed` with the reason
    `no-ready`: "could not connect". The wait ends at `ready`, before any
    signing, so the time the player takes in the window and the wallet is not
    bounded by it.
  - **A window the player closes** before an answer arrives is `declined`: no
    error is shown, and the entry stays available. The shell sees it by polling
    the handle's `closed` every 500 ms on its injected clock, from `begin` until
    an answer arrives, the 10 s wait for `ready` ends with no `ready`, or the
    session ends. A `ready` does not stop the polling: the window stays watched
    while the player chooses a wallet and signs. The first read that finds the
    window closed does not end the wait: the next read, 500 ms later, does, and
    an answer that arrives in between is taken. The signing page posts its
    answer and then closes itself (SP-9), so `closed` can read true before the
    answer's queued `message` event has run; one more read's time lets it
    arrive, and a window the player closed is still `declined` at most one read
    later (decided by the human, 2026-11-21).
  - **The Wrapper closes the window** (`close()` on its handle) as soon as an
    answer (`result` or `failed`) arrives, whatever it says, and when the
    session ends while the window is open (the state then becomes `failed` with
    the reason `session-ended`, and nothing is registered). After an answer this
    close is the fallback: the signing page drops its opener and then closes its
    own window ([Signing page](../signing-page.md), SP-9), because Chromium and
    WebKit no longer let the opener close a window that has dropped it (the
    Wrapper's `close()` then does nothing; Firefox still closes it). Either
    close ends the window's reference to the Wrapper's frame (RFC-006, Residual
    risk). Decided by the human, 2026-11-21.
  - **The answer's timing.** The signing page revokes its wallet connection
    before it answers (best effort, at most about 3 s; SP-9), so the answer can
    arrive up to about 3 s after the player signed in the wallet. Nothing in the
    Wrapper times that out: the window's `closed` and the session's end are the
    only other ends of the wait.
  - **One window at a time.** While the state is `signing`, `begin` is refused
    (`busy`) and opens nothing; the menu item focuses the open window (W-64). A
    `begin` the shell refuses (`busy`, or `not-offered` when the conditions
    changed between the click and the call) closes the handle it was given,
    never the window already open, and posts nothing to it.

## The protocol, `se.delegation/1`

- **W-67. `se.delegation/1`.** A closed protocol of its own, beside
  `se.operator/1` and `se.controller/1`, between the Wrapper's frame and the
  signing window only:

  | Direction               | `type`    | Fields                                                           | Meaning                                    |
  | ----------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------------ |
  | signing page to Wrapper | `ready`   | `schema`, `type`                                                 | the page loaded with an opener and listens |
  | Wrapper to signing page | `request` | `schema`, `type`, `actionKey`, `sessionId`, `expiry`, `noticeId` | what to sign                               |
  | signing page to Wrapper | `result`  | `schema`, `type`, `wallet`, `signature`                          | the wallet's signature                     |
  | signing page to Wrapper | `failed`  | `schema`, `type`, `reason`                                       | no signature; `reason` from a closed list  |

  `schema` is exactly `"se.delegation/1"`. The message set and its fields are
  frozen within `/1`.

  - **Message rules**, as for the other two protocols: a message is read only
    through the own data properties of a plain object with exactly its type's
    fields, each of its type; anything else (another `schema`, a `type` this
    direction does not allow, a missing or extra field, a field of another type,
    a string, an array) is ignored and never answered, so a sender learns
    nothing from a refusal.
  - **Shapes.** `actionKey` and `wallet`: `0x` and 40 hex digits, never the zero
    address; `sessionId`: the redeem's string (`^ses_[0-9a-f]{32}$`); `expiry`:
    a safe integer of at least 1, unix seconds; `noticeId`: the notice's `id`
    (`^[a-z0-9-]{1,64}$`); `signature`: `0x` and 130 hex digits, either case;
    `reason`: one of `no-wallet`, `rejected` (the player refused in the wallet),
    `unknown-notice`, `invalid-request`, and `wallet-error`. A `result` or
    `failed` whose values break these shapes is ignored like any malformed
    message.
  - **What the Wrapper sends.** `request`, once, to the window's handle only,
    with `targetOrigin` `signingPageOrigin` (never `"*"`), after the first valid
    `ready`: `actionKey` is the shell's action key's address (EIP-55);
    `sessionId` is the redeem's `sessionId`, never the Snapshot's
    `context.sessionId`, whose pattern is wider; `expiry` is the redeem's
    `sessionExpiresAt` (the session's hard end, which no token outlives, W-2) in
    unix seconds: the RFC 3339 date-time read with `play-client`'s deadline
    reader (`parseDeadline`, a timestamp with seconds and a zone, as
    milliseconds since the epoch), divided by 1000 and floored. The server's
    instant is used as it is, never corrected by W-6's clock offset. The Play
    API document gives the field as `format: date-time` and does not exclude
    fractional seconds; the reader accepts them and the floor drops them, the
    backend's own "rounded down to the second". So a delegation lasts exactly
    the session; `noticeId` is the id of the notice the shell chose (W-63). A
    later `ready` is ignored.
  - **What the Wrapper accepts.** A message only when `event.source` is the
    window's handle and `event.origin` equals `signingPageOrigin` exactly;
    `ready` only before the request was sent, and `result` or `failed` only
    after it, the first one only. Every other message on this route is ignored.
  - **Dispatch by source first** (W-49b). The Wrapper's one `message` listener
    routes by `event.source` before anything parses: the operator page, the game
    frame, and, while a signing window is open, its handle, a third route to the
    shell's delegation use case; anything else is dropped. A message whose
    `event.source` is the Wrapper's own window (a wallet extension's content
    script posts to the Wrapper's own document, framed or not) is dropped. The
    game frame is never a route of this channel, and no `se.controller/1`
    message opens the dialog or the window.
  - **What crosses.** The action key's address, the session id, the expiry, the
    notice id, the wallet's address, and the signature, between two SE origins
    only. Never the private key (W-10), the play token, the launch code, a round
    id, or an amount.
  - The signing page's side of the protocol (its allowed Wrapper origins, its
    `ready` per origin, its own 10 s wait, the order of its answer) is in
    [Signing page](../signing-page.md), SP-5 to SP-9.

## Registering the delegation

- **W-68. The shell checks the answer itself.** A `result` is never trusted for
  where it came from. The shell builds the `KeyDelegation` it asked for (the
  chosen notice's `noticeHash`, its action key's address, the redeem's
  `sessionId` as `bytes32` through `signing`'s `sessionIdBytes32`, and the
  `expiry` it sent), and calls `signing`'s `recoverKeyDelegation` with the
  `result`'s `signature`: the wallet's `v` 0 or 1 and a high `s` are normalized
  (that signature only), and the signer recovered. When the recovered address is
  the `result`'s `wallet` (compared by bytes, `signing`'s `sameHex`), the
  delegation is **registered**: `wallet` (lowercase), `expiry`, `noticeHash`,
  and the canonical signature (lowercase), the form the start sends. Otherwise,
  or when recovery refuses the signature, nothing is registered and the state
  becomes `failed` with the reason `wallet-mismatch`. A `failed` answer makes
  the state `failed` with its `reason`.
- **Memory only (W-11).** The registered delegation lives in the shell's memory
  for the session, like the key: nothing is stored, and the player signs again
  in each session. The session's end forgets it.
- **W-69. The states, and what the player is told.** The shell's delegation
  state (`DelegationState`) is one of:

  | State        | When                                                                                       | The Wrapper shows (English staging drafts, as W-65's; W-48's catalogue)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `offered`    | the session opened; nothing tried yet                                                      | nothing; the menu item when W-64 holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
  | `signing`    | `begin` took a window handle                                                               | the menu item "Signing window open"; the status line is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | `registered` | W-68 registered the delegation                                                             | "Wallet linked. Every round you start in this session carries the link.", announced politely (W-46), and the menu's line (W-64)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | `declined`   | the player closed the window before an answer                                              | nothing; the menu item again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | `failed`     | `blocked`, `no-ready`, a `failed` answer's `reason`, `wallet-mismatch`, or `session-ended` | in the bar's alert line (`role="alert"`, W-46): the reason's label, then "You can play on without a wallet."; the menu item again (but for `session-ended`). The labels: `blocked` and `no-ready`, "The signing window could not connect. Close it if it opened."; `no-wallet`, "No browser wallet was found."; `rejected`, "You declined the signature in your wallet."; `unknown-notice` and `invalid-request`, "The signing window could not use this request."; `wallet-error`, "Your wallet reported an error."; `wallet-mismatch`, "The signature did not come from the wallet that was named." |
  | `refused`    | a delegated start was answered 422 `KEY_DELEGATION_*` (W-71)                               | W-71's alert and its two controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

  A failure's alert is dismissed by the player's next action (a start, the
  menu); it is never shown with the wallet's own message, a code, or an address.
  **The alert line's priority** (as built, 2026-11-21; the refused alert's top
  rank decided by the human, 2026-11-21): the line shows one error, the first of
  W-71's refused delegated start (while `refused`, or while a "Sign again"
  attempt begun from `refused` is open), a typed error (W-42, with W-71's
  "Continue without a wallet" when it refused a delegated start), the generic
  error, a failed attempt (this table's `failed`), and the connection problem
  (W-43). A lower one shows again once those above it are gone. The Wrapper
  never moves the focus for a state change of the delegation other than W-65's
  dialog and the controls of W-71, which take the focus as the player's own
  action's error does (W-46).

## Every start carries it

- **W-70. The start.** While the state is `registered`, every `start` of the
  session carries `keyDelegation`: `{ wallet, expiry, noticeHash, signature }`
  as registered (W-68), in the Play API's `StartRoundRequest`. W-22's single
  resend repeats the same body, the delegation included, so the kit never causes
  a 409 `CONFLICT` (the backend's start fingerprint includes the delegation). A
  start sent while the state is anything else carries no `keyDelegation` field
  at all (never `null`). A book game's start never carries one: the entry is not
  offered on a book game (W-64), and the shell refuses to register a delegation
  while the latest Snapshot is `playback` (`begin` answers `not-offered`).
  Autoplay runs book rounds only (W-61), so none of its starts carries one.
- **W-71. A refused delegated start.**
  - **422 `KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, or
    `KEY_DELEGATION_NOTICE_UNKNOWN`** to a delegated start: the backend started
    nothing (it checks the delegation before any round exists). The state
    becomes `refused` with the code; the delegation is kept, never dropped
    silently. The Wrapper tells the player, in the bar's alert line (staging
    drafts, as W-65's texts are): "Your wallet link was refused, and the round
    did not start." and the code's label (`KEY_DELEGATION_INVALID`, "The
    wallet's signature was not accepted."; `KEY_DELEGATION_EXPIRED`, "The wallet
    link has expired."; `KEY_DELEGATION_NOTICE_UNKNOWN`, "The signed text is not
    accepted here."), with two controls: **"Sign again"** (W-65's dialog; a new
    registration replaces the refused one; a new attempt that ends `declined` or
    `failed` returns the state to `refused`, the refused delegation still kept,
    with the attempt's own message shown first) and **"Continue without"** (the
    shell forgets the delegation and the state becomes `offered` again). While
    the state is `refused`, and while a "Sign again" attempt begun from
    `refused` is open (decided by the human, 2026-11-20: the start stays held
    until the attempt registers or returns to `refused`), the start control is
    disabled and the shell refuses a `start` (`refused` with
    `delegation-refused`) and sends nothing, so the player chooses before the
    next round. Only a 422 with one of the three codes is this refusal: the same
    code on another status is "any other refusal" (below). No code is retried as
    it is: the backend says none is retryable.

  - **The two controls** (decided by the human, 2026-11-21). "Sign again" shows
    only while W-64 offers its item (all four of its conditions hold, the
    pointer and hover queries included); "Continue without" always shows, also
    while a "Sign again" attempt begun from `refused` is open, where it releases
    the held start. Choosing "Continue without" clears the alert line: the
    refusal and its typed error (the 422) are set aside, and the line shows
    nothing more for them.
  - **Any other refusal of a delegated start** (a 400 `INVALID_ARGUMENT` from a
    backend that does not take the field yet, which refuses it as a schema
    error, or any other typed error) is shown as that refusal is today (W-42),
    with a **"Continue without a wallet"** control beside it. The delegation
    stays registered, and the next start carries it again, until the player
    chooses that control: it is dropped only by the player's choice, never
    silently. Choosing it drops the delegation and removes the control; the
    refusal itself stays shown until the player's next action, as W-42's errors
    do.
  - A 409 `CONFLICT` cannot come from the kit's own resend (W-70); one that
    comes anyway is "any other refusal".

## The delegation check

- **W-72. The round's evidence carries the delegation the shell sent.** The
  backend publishes a delegated round's delegation in the Snapshot as
  `proofs.keyDelegation` (`wallet`, `actionKey`, `sessionId` as `bytes32`,
  `expiry`, `noticeId`, `noticeHash`, `notice`, `signature`, `domain`,
  `acceptedAt`), on every Snapshot of the round that carries `proofs`, the same
  in every read; a round started without one never carries one, and a book round
  never does (the Snapshot schema refuses it, W-28). At W-26's point the shell
  checks it, beside the tip check (W-26b), for every config round of the
  session:
  - **Compared by value, never by string.** With a delegation sent: `wallet`,
    `noticeHash`, and `signature` equal the sent ones as the bytes their hex
    decodes to (`sameHex`; the backend echoes every hex value in lowercase, and
    `wallet` carries no EIP-55 checksum, so a string compare against a
    checksummed `wallet` would fail and cancel every delegated round);
    `actionKey` equals the shell's own key's address by bytes; `sessionId`
    equals `sessionIdBytes32` of the redeem's `sessionId` by bytes; `expiry`
    equals the sent `expiry` as an integer; `noticeId` and `notice` equal the
    chosen notice's `id` and text exactly. `domain` is fixed by the schema;
    `acceptedAt` is the engine's statement and is not compared.
  - **The failure's causes** (the round's `failure` is `delegation`, with
    `delegationFailure` one of): `mismatch` (any field above differs); `missing`
    (a delegation was sent and the round's Snapshot carries no
    `proofs.keyDelegation` once it is past `starting`: "missing" is judged on
    the first read past `starting`, as W-26's check 1 is, never on a `starting`
    one); `unexpected` (the round was started without a delegation and the first
    read of it that is judged, the first past `starting`, carries one);
    `changed` (a later read of the round carries a `proofs.keyDelegation` that
    differs, field by field as validated JSON, from the first one the shell
    checked, whether or not that one passed; or, decided by the human on
    2026-11-20, a round started without a delegation was judged on a read past
    `starting` that carried none, and a later read carries one; a read without
    the object is `missing` only under the rule above).
  - **Under W-26's `T_0` rule** (decided 2026-11-17):
    - **`T_0` settled** (checks 1 to 5 passed) and the delegation check failed
      with `mismatch`, `missing`, or `unexpected`: the shell signs
      `PlayerCancel` (W-25) once the round is `active`, as for a failed tip
      check, and signs it once, whichever of the two failed first or both did.
    - **Before check 5 has run**, a delegation failure waits for it, as a tip
      check failure does; if check 5 then fails, the next branch applies.
    - **`T_0` not settled** (one of checks 1 to 5 failed): the shell signs
      nothing for the round, not even `PlayerCancel` (W-26, W-15).
    - **`changed`** is handled as W-26's re-issue: the shell signs nothing more
      for the round (no cancel: a move may already be signed), the game's picks
      get `reject`, no cash-out is offered or signed, and a W-16 resend of a
      move or a cash-out already signed still goes out.
  - **What the player sees** is W-26's: "this round failed verification" (and
    "and was canceled" once a cancel shows it `canceled`), and the round
    receipt's reason `delegation` (W-59), labelled "The wallet link in this
    round's evidence does not match." (W-48). The round's evidence (W-27) keeps
    every `proofs.keyDelegation` the shell read for it.
  - A failed delegation check does not change the delegation's state: the
    session's later starts still carry it, and each round is checked on its own.

## What is stored, logged, and sent

- **W-73.** Nothing about the delegation is stored, on the Wrapper's origin or
  the signing page's (W-11, W-12): no storage, cookie, service worker, URL, or
  global holds the wallet's address, the signature, or the session id. Nothing
  is logged with them, and the delegation use case logs nothing at all; the
  shell's redacting logger stays the only way to log near them (W-4). No
  telemetry. The only places they go are the `request` and `result` messages of
  W-67, every delegated `start` (W-70), and the menu's shortened address (W-64).
  The player-started evidence export (W-27) holds the round's Snapshots,
  `proofs.keyDelegation` included, as the evidence publishes it.

## Tests

Rows T-43 to T-51 of the [test plan](../wrapper.md#test-plan): the vendored
contract (T-51), the start's field and codes (T-43), the shell's delegation use
case and `se.delegation/1` (T-44), the delegation check (T-45), the Wrapper's
entry, dialog, window, and configuration (T-46), the signing page (T-47 and
T-48, [Signing page](../signing-page.md)), the release and the deploy (T-49),
and the browser flow (T-50).
