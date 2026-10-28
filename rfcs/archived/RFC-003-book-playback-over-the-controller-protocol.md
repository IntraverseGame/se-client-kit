# RFC-003 — Book playback over the controller protocol

- Status: archived
- Archived: 2026-10-28 (accepted and folded into the specs below)
- Author: kit maintainers (issue #146)
- Created: 2026-10-28

## Problem

`se.controller/1` today carries only the `steps` presentation. The game's
`hello` must declare `steps` (W-38), the Wrapper forwards no `playback`
Snapshot, and the `snapshot` message's copy is built from the `steps` allow-list
only. A book game (`presentation: "playback"`, `model: "book"`) needs its drawn
book's events to play the round back, and it cannot get them. The staging
catalog names `book-slot-v1` at the staging game origin, which the kit serves,
so the kit's reference game must play it
([Book playback](../../specs/wrapper/book-playback.md), W-50 to W-56).

## Motivation

- The player sees a book round's outcome only as the game plays the draw back;
  the Wrapper shows the payout, but the events are the game's to render.
- The protocol is the security boundary toward an untrusted game (W-38). Adding
  a presentation changes what crosses it, so the change is written down and
  reviewed here, not slipped into the allow-list.

## Proposed solution

The protocol stays `se.controller/1`. The message set is unchanged (`hello`,
`action`, `snapshot`, `reject`); one message gets a second shape, and two rules
change.

1. **`hello`.** A game must declare all seven statuses and at least one
   presentation (`steps`, `playback`). `steps` is no longer required.
2. **Which Snapshots are sent.** The Wrapper sends a Snapshot only in a
   presentation the game declared. When the Snapshot it is about to send (the
   latest it holds when the `hello` arrives, or any later one) has a
   presentation the game did not declare, it shows "game not compatible" and
   sends and accepts nothing more, as today for a `hello` without `steps`. A
   session has one presentation (W-53), so this decides once per session in
   practice.
3. **The `playback` copy of the `snapshot` message.** Built field by field from
   the validated Snapshot, never by removing fields:
   - `version`, `presentation` (`playback`), `status`, `closeReason`, `roundId`;
   - `context.language`, `context.device`, `context.theme.appearance`;
   - `config.kind` (`book`), `config.model`;
   - `config.draw` when present (`won`, `lost`): `index`, `payoutMultiplier`,
     and `events[]` with `index`, `type`, and `data` when present. `data` is the
     one member the schema leaves open; it is copied as a deep copy of its JSON
     value from own data properties only.

   Left out, as from the `steps` copy: all of `proofs`, `context.sessionId`,
   `links`, `country`, `view`, `colorPalette`, `tileStyles`, `bet`, `payout`,
   `bankedAmount`, `schema`, and `model`; and also `config.packageHash` and
   `config.rtp` (the Wrapper shows the RTP, W-56).

4. **Picks on a book round.** Once `playback` Snapshots are forwarded they
   update the bridge's pre-check, and a pick while the latest Snapshot sent is
   `playback` gets `reject: not_legal`, whatever its status. The shell refuses
   it too (W-51), so nothing is signed.
5. **The controller types** (`@intraverse/se-client-shell/controller`) gain the
   copy's type (`GamePlaybackSnapshot` beside `GameSnapshot`, its draw and event
   types), still type-only.

The spec text is in
[the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
and [Book playback](../../specs/wrapper/book-playback.md), now as decided.

## Alternatives

- **A new message type** (`playback`, or `draw`) instead of a second shape of
  `snapshot`. It would split ordering (`version`) across two messages and make
  the game merge them; the Snapshot already orders everything. Not proposed.
- **`se.controller/2`.** Nothing that a `steps` game sends or receives changes:
  a game that declares `steps` only receives exactly what it does today. A new
  version would force every game to change for no gain. Not proposed.
- **Forward the whole validated Snapshot.** Breaks the allow-list rule (W-38): a
  field the schema adds would reach the game unreviewed. Rejected.
- **The game fetches the draw itself** (from the verify API or the package). The
  game has no session and must not call the Play API; it would also need network
  access its CSP denies. Rejected.
- **Keep `steps` required in `hello`.** Works for the reference game, which
  plays both, but refuses a book-only game for no reason. Not proposed.

## Tradeoffs

- `data` is open: the game receives whatever the math package published for an
  event. It is the backend's served content, validated as a Snapshot, and the
  game is already untrusted and sandboxed on its own origin; the Wrapper only
  makes sure it sends plain data.
- The `playback` copy has no size bound beyond the Snapshot's own. A large book
  is the Snapshot's cost, not a new one.

## Impact

- `shell`: the bridge's compatibility rule, the `playback` copy builder, the
  pre-check, and the controller types; the property test over recorded sessions
  covers the book vectors (T-23).
- `reference-game`: the `hello`, the copy's parser, and the book page.
- `wrapper`: none at the protocol level (the bridge is the shell's).
- No change to `se.operator/1`, the Play API, or the Snapshot schema.

## Migration considerations

A `steps` game that declares `steps` keeps working unchanged. A game that
declares `playback` and gets a `steps` session (or the reverse) ends in "game
not compatible", as an incompatible game does today. Nothing is released yet, so
no deployed game is affected.

## Decisions (2026-10-28)

Decided by the human, 2026-10-28 (issue #146); each point names the spec that
now holds it, and the spec is canonical:

- **The `hello` rule** (points 1 and 2): a game declares all seven statuses and
  at least one presentation, `steps` is no longer required, and a Snapshot in a
  presentation the game did not declare ends in "game not compatible". Held in
  [the controller boundary](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md).
- **The `playback` allow-list** (point 3), as proposed, with
  `config.packageHash` and `config.rtp` left out. Held in the same spec.
- **A pick on a book round** (point 4): a pick while the latest Snapshot sent is
  `playback` gets `reject: not_legal`, whatever its status, checked before the
  status check, and the shell's pick use case refuses it too, so nothing is
  signed. Held in the controller boundary spec and in
  [Book playback](../../specs/wrapper/book-playback.md) (W-51).
- **The controller types** (point 5): `GamePlaybackSnapshot` and its draw and
  event types on the type-only `controller` subpath. Held in
  [the reference game](../../specs/client-kit/the-reference-game.md#the-controller-types-decided-with-the-reference-game-issue-10).
- Around the protocol, held in
  [Book playback](../../specs/wrapper/book-playback.md): the Wrapper shows the
  RTP (W-56), the frame stays shown at `won` and `lost` until the next start
  (W-55), and the reference game renders the draw as generic text
  ([the reference game](../../specs/client-kit/the-reference-game.md)).

- **The backend's answers** (2026-10-28), which the protocol takes as they are:
  a book round shows only `idle`, `starting`, `won`, and `lost`, so the
  `playback` copy is sent in those four statuses
  ([Book playback](../../specs/wrapper/book-playback.md), W-54); an event's
  `type` is always present and its `data` is absent or an object, so the copy of
  `data` stays a plain deep copy and the reference game refuses any other shape;
  and `presentation`, `config.kind`, and `config.model` never change within a
  session, which the `hello` rule relies on (W-53).

## Unresolved questions

None. The Snapshot contract is still to refuse `active`, `resolving`, and
`canceled` on a book round and to state the one-presentation rule; the kit
re-vendors it then, and that sync is a marker in
[Book playback](../../specs/wrapper/book-playback.md) (W-54), not a question of
this RFC.
