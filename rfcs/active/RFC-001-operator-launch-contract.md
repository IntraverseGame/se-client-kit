# RFC-001 — The operator launch contract: the handshake, resize, lobby, and deposit

- Status: active (partly accepted 2026-10-18, decided by human review; see
  [Decisions](#decisions-2026-10-18))
- Author: the documenter agent, for human and PO review
- Created: 2026-10-17
- Unblocks: issue #42 (W-49, T-9a); the "Operator launch contract" item of #13

Most of this RFC was accepted on 2026-10-18 by human review, and the backend's
TPO answered the questions addressed to the backend the same day. The accepted
points are now normative in
[`specs/wrapper/operator-embedding.md`](../../specs/wrapper/operator-embedding.md)
(W-49 to W-49f) and the specs it links, and recorded in
[ADR-006](../../decisions/ADR-006-the-operator-protocol-se-operator-1.md) and
[ADR-007](../../decisions/ADR-007-no-public-suffix-list.md) (both proposed). The
spec, not this file, is canonical for them. Q4, Q10, and Q16 stay open; the RFC
stays in `rfcs/active/` until they are decided, then it is archived. The
sections below keep the reasoning as it was proposed.

## Decisions (2026-10-18)

Decided by human review on 2026-10-18 unless the row says otherwise. Each row
names where the decision now lives.

| ID  | Decision                                                                                                                                                                                                                                                                   | Now in                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Q1  | **Accepted, A:** a separate `se.operator/1`                                                                                                                                                                                                                                | W-49b; ADR-006                                              |
| Q2  | **Accepted, A:** the handshake on every framed browser                                                                                                                                                                                                                     | W-49a, W-49c; ADR-006                                       |
| Q3  | **Accepted, A:** the redeem, the start, and every signature wait for the handshake                                                                                                                                                                                         | W-49c; ADR-006                                              |
| Q4  | **Open.** Today's behaviour stays: a standalone launch needs no handshake                                                                                                                                                                                                  | W-49a (today's behaviour)                                   |
| Q5  | **Accepted, A:** direct embedding only (`window.parent === window.top`). It tightens the minimum shipped in #58; the change lands with #42                                                                                                                                 | W-49a; ADR-006                                              |
| Q6  | **Accepted, A:** 10 s, final; a provisional Wrapper configuration value                                                                                                                                                                                                    | W-49c                                                       |
| Q7  | **Accepted, A:** lobby and deposit are navigations to the Snapshot's `context.links`                                                                                                                                                                                       | W-49e; ADR-006                                              |
| Q8  | **Accepted, A:** neither control while `starting`, `active`, or `resolving`, or while an action is pending                                                                                                                                                                 | W-49f                                                       |
| Q9  | **Agreed with the backend's TPO, A:** capabilities come from the backend's Snapshot negotiation, never the operator handshake. The carrier is a change to the Play API document, to come, built only when the first variant ships (a new `RoundStatus` or `se.snapshot/2`) | W-30 (its `TODO(Play API)` names the commit when published) |
| Q10 | **Open.** Recorded as a residual risk with no technical control in the first release (a contractual control on listed operators); whether a technical control comes later is undecided                                                                                     | the Security section of the operator-embedding spec         |
| Q11 | **Decided "not now", confirmed by the backend's TPO:** any listed operator origin may frame any launch. A later contract change may serve the session's operator origin on `sessions:redeem`; not in the first release                                                     | the Security section of the operator-embedding spec         |
| Q12 | **Accepted, A:** the lobby's origin on `operatorOrigins`, the deposit any `https:`                                                                                                                                                                                         | W-49e                                                       |
| Q13 | **Accepted, A:** record the first early `hello` from `window.parent`, check it after validation                                                                                                                                                                            | W-49c; ADR-006                                              |
| Q14 | **Accepted, A:** answer a later valid `hello` with `welcome` again                                                                                                                                                                                                         | W-49c; ADR-006                                              |
| Q15 | **Accepted, A:** `resize` bound 16384 CSS pixels, provisional                                                                                                                                                                                                              | W-49d                                                       |
| Q16 | **Open,** a follow-up: the balance after a deposit in another tab                                                                                                                                                                                                          | a `TODO(RFC-001 Q16)` in W-49f                              |

Decided at the same review, outside the numbered questions:

- **The refusal log:** one event, `embedding.refused`, with the reasons
  `nested`, `operator-not-allowed`, and `handshake-timeout` added to the built
  ones; the RFC's `operator.refused` is not used. In the operator-embedding
  spec, What is logged, and the Wrapper spec's Observability section.
- **Disjoint origins:** `operatorOrigins`, `gameOrigins`, and the SE origin
  share no entry; a configuration that breaks this is refused. In the Wrapper
  spec's Configuration section.
- **The `se.operator/1` ADR:** written as
  [ADR-006](../../decisions/ADR-006-the-operator-protocol-se-operator-1.md)
  (proposed).
- **W-37's registrable-domain rule without a public suffix list:** refuse D when
  its host shares its last two labels with the SE host, recorded in
  [ADR-007](../../decisions/ADR-007-no-public-suffix-list.md) (proposed). In
  W-37.
- **The launch code's lifetime** (answered by the backend's TPO): 60 s from the
  operator's Launch call, not from the page's load; the kit's worst case before
  the redeem is about 25 s. No contract change. In W-49c.
- **The Firefox and WebKit e2e projects** that T-9a's cases on those engines
  need are added separately; T-9a declares those cases pending until they exist.

## Problem

The Wrapper runs in an iframe on the SE origin, embedded by an operator page on
origin A, and hosts the game in a second iframe on origin D. W-49 already states
the rule for the operator side: accept a message only when
`event.source === window.parent` and `event.origin` is in `operatorOrigins`,
reply only to that origin, parse against a closed schema; refuse to start where
`location.ancestorOrigins` shows an unlisted ancestor; and, where that API is
missing (Firefox), sign nothing until a handshake from a listed origin arrives.

What W-49 does not define, and the `TODO(operator launch contract)` marker in
[`specs/wrapper.md`](../../specs/wrapper.md#operator-embedding) records:

- the handshake itself: its messages, who sends first, its versioning, its
  `targetOrigin` rules, its timeouts, and what a missing or invalid handshake
  does;
- `resize`, `lobby`, and `deposit`, which the
  [Boundary](../../specs/wrapper.md#boundary) section names as messages to the
  operator page: their direction, fields, validation, and the Wrapper states
  that may produce them.

T-9a cannot be written without them. Two neighbouring markers that #42 names are
related but are not this repository's to close alone:

- `TODO(Play API)` in
  [`rendering-from-the-snapshot.md`](../../specs/wrapper/rendering-from-the-snapshot.md)
  (W-30): the carrier of the Wrapper's capability declaration;
- the game origin D in
  [`the-game-iframe-and-the-controller-boundary.md`](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  (W-37): no longer open, since the redeem answer now serves D
  (`RedeemResponse.gameOrigin`, the catalog value).

**What the backend has said** (as relayed for this RFC, 2026-10-17): the launch
handshake is this repository's to design; the backend has no mechanism for
`resize`, `lobby`, or `deposit` and plans none; lobby and deposit reach the
Wrapper only as operator-supplied URLs in the Snapshot's `context.links`
(`lobby`, `deposit`, each an `https:` URL in `se.snapshot/1`); and the backend's
only capability notion is the Snapshot's own variant negotiation (presentations
and statuses), which is not built yet and is not a launch-handshake mechanism.

#13 says this repository owns the operator message schema. The launch URL itself
(the whole fragment is the launch code, W-1) is already decided and is out of
scope here.

## Motivation

- **Firefox has no `location.ancestorOrigins`.** Without a handshake, the
  Firefox path of W-49 can never unlock signing, so a framed Wrapper cannot play
  there at all (a standalone launch is not affected,
  [Q4](#unresolved-questions)).
- **Defense in depth for clickjacking.** `frame-ancestors` is the primary
  control, but it is a response header the deploy side fills from the
  environment
  ([client-kit.md](../../specs/client-kit.md#how-the-wrapper-reaches-the-superengine-origin)).
  It is ignored in a `<meta>` policy, so a missing or wrong header leaves only
  the Wrapper's own checks. Those checks need a defined protocol to be testable.
- **Operators need a stable, small integration surface.** They must size the
  iframe, and the player must be able to reach the lobby and the deposit flow.
  Each is today only a sentence in the Boundary section.
- **A closed schema is the security model of the kit** (W-38 for the game). The
  operator channel needs the same: one parser, one allow-list, nothing secret.

## Proposed solution

### Overview

1. A second, separate message protocol, **`se.operator/1`**, between the
   operator page (the Wrapper's `window.parent`) and the Wrapper, with three
   messages:

   | Direction           | `type`    | Purpose                                                 |
   | ------------------- | --------- | ------------------------------------------------------- |
   | operator to Wrapper | `hello`   | the handshake: "I am the page that embeds you"          |
   | Wrapper to operator | `welcome` | the handshake is accepted; the operator stops repeating |
   | Wrapper to operator | `resize`  | the height the Wrapper's content needs                  |

   The operator page sends exactly one kind of message, `hello`. Nothing it
   sends can start a round, sign, or change what the Wrapper shows beyond
   unlocking it.

2. **Lobby and deposit are navigations, not messages.** They are the player's
   clicks on the Wrapper's own controls, which follow the operator-supplied
   `context.links` of the validated Snapshot: the lobby replaces the top-level
   window, the deposit opens in a new browsing context
   ([Lobby and deposit](#lobby-and-deposit-navigations-to-contextlinks),
   [Q7](#unresolved-questions)). No URL is ever taken from a message.

3. **The capability declaration is the Snapshot's variant negotiation**, a
   backend-owned mechanism that is pending. The handshake defines no capability
   ([The capability declaration](#the-capability-declaration-w-30),
   [Q9](#unresolved-questions)).

### Versioning: a separate `se.operator/1`

Every message carries `schema: "se.operator/1"` and a `type`, as
`se.controller/1` messages do. The two protocols stay separate:

- **Different counterparties and trust.** The game is untrusted code on D; the
  operator page is a listed embedder on A. Each channel accepts messages from
  exactly one `event.source`, and a separate `schema` value means a message
  valid on one channel can never parse on the other.
- **Different release cadences.** The controller API grows with the game
  ([later increments](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)),
  and the `reference-game` depends on its types. An operator integration should
  not have to follow controller changes, and a game developer should not see
  operator messages.
- **Different audiences.** Operators integrate once per site; game developers
  once per game. Each reads one protocol.

A change to the message set or to any message's fields is `se.operator/2`. A
Wrapper MAY accept both versions during a transition; within `/1`, nothing is
added.

### The message rules (shared)

The rules are those of `se.controller/1`
([the message rules](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)),
applied to this channel:

- A message is a plain object with exactly its fields. A string (a JSON text
  included), an array, a non-plain object, an accessor property, a symbol key, a
  missing field, or an extra field fails the schema and is ignored.
- A message whose `schema` is not `se.operator/1`, or whose `type` is not one
  this direction allows, is ignored. The Wrapper never answers a message it
  ignores (no error reply), so a sender learns nothing from a refusal.
- **Dispatch by source first.** The Wrapper has one `message` listener. It
  routes by `event.source` before it parses: `window.parent` goes to the
  operator channel, the game frame's `contentWindow` to the controller bridge
  (W-38), and anything else is dropped. Then each channel checks `event.origin`
  (A on `operatorOrigins`, or D) and its own schema. When the Wrapper is not
  framed, `window.parent === window`, so there is no operator route at all: a
  message whose source is the Wrapper's own window is dropped like any other.
- **No secret in any message, in either direction.** No action key, play token,
  launch code, signature, proof, `CreateRoundAuth`, header, session id, round
  id, or amount. (No `se.operator/1` message carries money; if a later version
  adds one, it is a base-unit string, never a JS `number`, W-34.)
- **`targetOrigin` is always one exact origin.** Never `"*"` and never `"/"`.

### The handshake

**Who sends first: the operator page.** The Wrapper never posts to a window
whose origin it has not verified, and on Firefox it cannot learn the parent's
origin until the parent writes to it. The operator page knows the SE origin: it
is the origin of the launch URL it was given by the backend's operator launch.

1. The Wrapper installs its `message` listener at boot, before it reads the
   environment configuration document. **Proposed: record, then check**
   ([Q13](#unresolved-questions)). Until the document is validated, the Wrapper
   cannot check an origin against `operatorOrigins`, so it records the first
   well-formed `hello` whose `event.source === window.parent`, together with its
   `event.origin` (set by the browser, not by the sender), and answers nothing.
   It keeps no other message. Recording is safe because the parent is fixed for
   the life of the Wrapper's document: a parent that navigates discards the
   Wrapper's document with it, so the recorded origin can only ever be the
   origin of the page that embeds this document. The configuration read can take
   up to 15 s (W-43), and is retried without limit while the document is
   unreachable ([Configuration](../../specs/wrapper.md#configuration)), so a
   rule that dropped early `hello` messages would let a healthy operator time
   out.
2. When the document is validated, the Wrapper decides whether it is framed:
   - **not framed** (`window.parent === window`): a standalone launch. There is
     no handshake and no operator channel ([Q4](#unresolved-questions)); the
     Wrapper continues as today.
   - **framed, nested** (`window.parent !== window.top`): the
     configuration-error state, nothing redeemed or signed
     ([Q5](#unresolved-questions)).
   - **framed, and `location.ancestorOrigins` exists**: unless it holds exactly
     one entry and that entry is on `operatorOrigins` (exact match), the
     configuration-error state, nothing redeemed or signed (W-49 as today). An
     entry of `"null"` is not on the list, so it refuses too (see the masking
     note below). Otherwise the handshake below is still required
     ([Q2](#unresolved-questions)).
   - **framed, and the API is missing** (Firefox): the handshake below.

   If a `hello` was recorded (step 1), it is checked now as in step 4: a listed
   origin completes the handshake at once, and an unlisted one is the
   configuration-error state (the parent's origin cannot change, so waiting
   would not help). Otherwise the handshake timer starts now.

3. **The operator page** posts `hello` to the Wrapper iframe's `contentWindow`
   with `targetOrigin` set to the SE origin, on the iframe's `load` event and
   then every 250 ms **until `welcome` arrives** (operator guidance, SHOULD).
   The operator does not stop on a timer of its own: the Wrapper's configuration
   read may be slow, and the repeats cost nothing. It stops when `welcome`
   arrives or when it removes the iframe. `hello` has exactly two fields:
   `schema: "se.operator/1"` and `type: "hello"`.
4. **The Wrapper accepts the first `hello`** (the recorded one, or the first to
   arrive after the document is validated) that has
   `event.source === window.parent`, an `event.origin` on `operatorOrigins`
   (exact match, and equal to `location.ancestorOrigins[0]` where that exists),
   and a valid schema. From then on, for the life of the Wrapper's document:
   - the **operator origin** is fixed to that `event.origin`; every later post
     uses it as `targetOrigin`, and every later message must come from it and
     from `window.parent`;
   - the Wrapper posts `welcome` (exactly `schema` and `type: "welcome"`);
   - **proposed: re-send `welcome`** ([Q14](#unresolved-questions)). A later
     valid `hello` from the fixed origin and `window.parent` does not reopen the
     handshake (the first counts, as in `se.controller/1`), but the Wrapper
     answers it with `welcome` again, to the fixed origin. That is harmless,
     since `welcome` carries nothing, and it lets an operator whose first
     `welcome` was missed (a listener added late, a repeat that crossed it) stop
     repeating.

5. **What the handshake unlocks.** Until it is accepted, the Wrapper redeems
   nothing, starts no round, signs nothing, mounts no game iframe (so the
   controller bridge has nothing to talk to), and offers no control, the lobby
   and deposit included; it shows the loading state
   ([Q3](#unresolved-questions)). This is stricter than W-49's "MUST NOT sign":
   the start call carries no signature (W-22) but commits the bet, so it is
   gated too. The launch code is still read and stripped from the URL first
   (W-1), so it waits in the shell's closure, not in the URL.

**Timeout.** The timer starts only once the configuration document is validated
and no `hello` was recorded (step 2). If no valid `hello` is accepted within
**10 s** of its start (Wrapper configuration, SHOULD; PROVISIONAL until review,
[Q6](#unresolved-questions)), the Wrapper shows the configuration-error state.
That is final for the page: a late `hello` is ignored, nothing is redeemed, and
the operator reloads the iframe to retry. The launch code is never sent, and it
expires on the backend's schedule. With the record-then-check rule, a slow
configuration read cannot by itself cause a timeout: a `hello` the operator sent
while the document was loading is already recorded.

**`ancestorOrigins` masking.** The HTML standard masks an ancestor's origin when
the embedding iframe's referrer policy is `no-referrer` (or `same-origin` for a
cross-origin parent): the entry becomes an opaque origin, which
`location.ancestorOrigins` reports as `"null"`
([HTML, 3.1.3 Ancestor origins](https://html.spec.whatwg.org/multipage/dom.html#internal-ancestor-origin-objects-list-creation-steps)).
So an operator page that sets `referrerpolicy="no-referrer"` (or `same-origin`)
on the Wrapper's iframe would be refused on that path. Operator guidance: do not
set either value on the Wrapper's iframe. Whether each engine implements the
masking as the standard says is an assumption T-9a settles (unit test 6 and e2e
test 13).

**A missing or invalid handshake.** Every message that fails a check (source,
origin, schema) is ignored, and the timer keeps running. A page that never sends
a valid `hello` reaches the timeout. No message is ever posted to a sender that
failed the checks.

**What is logged.** Through the shell's redacting logger, at `warn`, once per
page: `operator.refused` with a `reason` code only (`ancestor-not-allowed`,
`nested`, `operator-not-allowed` for a recorded `hello` from an unlisted parent,
`handshake-timeout`), never an origin or a message's content. Nothing is logged
for an ignored message (a hostile page could otherwise flood the console). This
follows the [Observability](../../specs/wrapper.md#observability) section: no
backend telemetry, console only.

### `resize`

| Field    | Value                                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema` | `"se.operator/1"`                                                                                                                                                                                          |
| `type`   | `"resize"`                                                                                                                                                                                                 |
| `height` | the height the Wrapper's content needs, in CSS pixels: the document's `scrollHeight`, an integer from 1 to 16384 (a larger value is sent as 16384; the bound is PROVISIONAL, [Q15](#unresolved-questions)) |

- From the Wrapper to the operator page, only after `welcome`, only to the fixed
  operator origin. No reply; the operator page MAY ignore it.
- Sent once right after `welcome`, then whenever the height changes (observed
  with `ResizeObserver`), at most once per animation frame, and never with the
  same value twice in a row. It may be sent in every state after `welcome`,
  error states included (so an error's text is not cut off), and in no state
  before it.
- No width: the operator page lays out the width, and the Wrapper's layout
  follows it (W-47's 200 % zoom rule).
- It is the only message the Wrapper sends on its own. No game message, and no
  field of a Snapshot, changes it except through the Wrapper's own layout.

### Lobby and deposit: navigations to `context.links`

The backend supplies the lobby and deposit only as the operator's URLs in the
Snapshot (`context.links.lobby`, `context.links.deposit`, each an `https:` URL
the `se.snapshot/1` schema validates). The Wrapper uses those links and never a
URL from a message, a URL parameter, or the game. The proposal (option **A** of
[Q7](#unresolved-questions)):

| Control | When framed (after `welcome`)                                                                                                                                                  | When standalone                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Lobby   | an `<a href="{context.links.lobby}" target="_top" rel="noreferrer" referrerpolicy="no-referrer">`: the player's click navigates the top-level window (the operator page) to it | the same link, navigating the Wrapper's own window (it is the top) |
| Deposit | an `<a href="{context.links.deposit}" target="_blank" rel="noopener noreferrer">`: a new browsing context; the session stays open                                              | the same                                                           |

The rules:

- **Only the player's click.** The navigation is an anchor the player activates,
  never script on a timer, a poll, a Snapshot, an error by itself, or a game
  message, so the game cannot make the operator page navigate. A click is the
  user activation browsers require before a cross-origin frame may navigate the
  top-level window; T-9a checks this on each engine it runs on (Chromium today;
  Firefox and WebKit once their projects exist).
- **The URL rule.** The schema's `HttpsUrl` is only a pattern
  (`^https://[^\s]+$`, at most 2048 characters), so the Wrapper parses each link
  with `new URL(link)` before it shows a control. A link that fails to parse,
  whose `protocol` is not `https:`, or that carries credentials (a non-empty
  `username` or `password`) shows no control. The anchor's `href` is the parsed
  URL's `href`.
- **The link's origin.** The lobby replaces the operator's page, so its origin,
  `new URL(link).origin`, MUST be on `operatorOrigins` (exact match); otherwise
  the control is not shown. The deposit opens apart from the operator's page and
  may be on a payment provider's origin, so it only needs the URL rule above.
  Both are open to review ([Q12](#unresolved-questions)).
- **Present or not.** A control is shown only when its link is present in the
  latest validated Snapshot (and, for the lobby, passes the origin rule). With
  no link, there is no control; the Wrapper never builds or guesses a URL.
- **No referrer, no opener.** The deposit anchor has
  `rel="noopener noreferrer"`, as the verify link does (W-39): the new page gets
  no `window.opener` and no referrer. The lobby anchor has `rel="noreferrer"`
  and `referrerpolicy="no-referrer"`, so it sends no referrer even where the
  release bundle's `Referrer-Policy: no-referrer` header is missing (the header
  is set by the deploy side, and the page's `<meta>` policy does not carry it).
  The lobby navigation discards the Wrapper's document, so there is no opener to
  keep.
- **The CSP needs no change.** The release policy limits fetches, frames, forms
  (`form-action 'none'`), and `base-uri`; it has no navigation directive, so it
  does not govern following a link. The links are not fetched, framed, or posted
  to. `Permissions-Policy` is unaffected.
- **Leaving ends the session.** A lobby navigation discards the key and the
  token with the page (OQ-1). Hence the state rule below.

**Which states offer the controls.** The state names are those of
[W-44](../../specs/wrapper.md#error-and-degraded-states) and the status table of
[W-31](../../specs/wrapper/rendering-from-the-snapshot.md).

| Wrapper state                                                                                                                         | Lobby                                   | Deposit                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- |
| before `welcome` (framed), loading, the configuration-error state                                                                     | no                                      | no                               |
| `idle`, and a typed error shown at `idle`, `INSUFFICIENT_FUNDS` included (W-42)                                                       | yes                                     | yes                              |
| `starting`, `active`, `resolving`, or any state with a signed action not yet seen applied (W-15)                                      | no ([Q8](#unresolved-questions))        | no ([Q8](#unresolved-questions)) |
| `won`, `lost`, `canceled` (the round id and verify link shown, W-39)                                                                  | yes                                     | yes                              |
| session ended (the relaunch instruction of W-1a and W-2)                                                                              | yes, labelled as the way to relaunch    | no                               |
| open in another tab, round failed verification, out of sync, Snapshot rejected (W-44)                                                 | yes, from the latest validated Snapshot | no                               |
| connection problem (W-43), chain check not independent (W-26a), "game not compatible" (W-38), the generic error (W-42) outside `idle` | no                                      | no                               |
| any other state, including one a later spec adds                                                                                      | no                                      | no                               |

In the session-ended state, the lobby is the "ask the operator's page for a new
launch" step the Play API document describes for `SESSION_EXPIRED` and
`SESSION_REVOKED`. A state reached before any Snapshot was validated (a refused
redeem, for example) has no `context.links` and so no control: it shows the
relaunch instruction as text, as today.

The rejected alternative, `lobby` and `deposit` as `se.operator/1` messages, is
kept with its schema under [Alternatives](#alternatives) in case review picks
it.

### The capability declaration (W-30)

- **What the RFC proposes it is.** The "capability declaration" of W-30 and its
  `TODO(Play API)` marker is **the Snapshot's variant negotiation**: the
  Wrapper's statement of the presentations (`["steps"]`) and every `RoundStatus`
  it handles (all seven), so that the backend sends only variants the Wrapper
  can render. The vendored Play API document already points at it: `RoundStatus`
  says "new values only behind a client capability flag". It is not part of the
  operator launch.
- **Who owns it.** The backend. It is the backend's only capability notion, and
  it is not built yet. Who sends what, when, and how it is carried are for the
  backend to define; this RFC proposes no field, header, call, or shape. The
  kit's side is fixed already: the shell declares, in whatever carrier the
  backend defines, what W-30 lists. It is [Q9](#unresolved-questions).
- **Not in the handshake.** The operator page cannot vouch for which kit version
  renders the launch, and the backend's negotiation does not run through it, so
  `se.operator/1` carries no capability. The game's `hello` is the game's
  declaration to the Wrapper (W-38), a separate matter.
- **Until it exists, the Wrapper fails closed, in two different ways.**
  - A **status** outside `se.snapshot/1` (a value a later schema adds) fails
    Snapshot validation (W-28), because the schema's objects and enums are
    closed: the Wrapper shows the Snapshot-rejected state.
  - A **presentation** the Wrapper does not render is not a validation failure:
    `playback` is valid `se.snapshot/1`. The Wrapper accepts such a Snapshot and
    does not forward it to the game in the first release
    ([the message rules](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)),
    so the game gets no pick to send. The negotiation is what would keep the
    backend from sending one; the operator handshake plays no part in it.

### What this RFC does not decide

- **Where D comes from** is decided (the launched game's catalog entry, by the
  product owner, 2026-10-17, W-37). The catalog field is backend-owned, and the
  redeem answer now serves it (`RedeemResponse.gameOrigin`). This RFC only
  confirms that no `se.operator/1` message carries D, a game id, or any input to
  the game's mount.
- **The "different registrable domain" rule of W-37** needs a public suffix
  list, a new dependency, and so its own ADR (#42).
- **The launch URL**, the launch code's form, and the operator's side of the
  backend's launch are owned elsewhere and named only (W-1).

## Security considerations

**Origin and source checks.** Both are needed, on both sides.

- The Wrapper checks `event.source === window.parent` first (dispatch), then the
  origin. An origin alone would accept a sibling iframe, a popup, or another tab
  of a listed operator origin; a source alone would accept a parent that is not
  listed.
- `operatorOrigins` and `gameOrigins` MUST be disjoint, and neither may hold the
  SE origin. Proposed as a new configuration rule (the configuration-error state
  otherwise), so that no origin can be both an embedder and a game.
- The operator page MUST check, on every message it receives, that
  `event.source` is the Wrapper iframe's `contentWindow` and `event.origin` is
  the SE origin, and MUST post with `targetOrigin` set to the SE origin. This is
  operator guidance; the Wrapper cannot enforce it, which is why nothing the
  Wrapper sends is secret.

**Clickjacking: `frame-ancestors` versus the Wrapper's checks.**

| Control                                            | Covers                                                                 | Limits                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP `frame-ancestors {{operatorOrigins}}` (header) | every ancestor, enforced by the browser before the Wrapper's code runs | a header only: ignored in the page's `<meta>` policy; depends on the deploy side; one list per environment, so any listed operator can frame any launch |
| `location.ancestorOrigins` check                   | every ancestor, in Chromium and WebKit, at boot                        | missing in Firefox; runs after the page has loaded                                                                                                      |
| the handshake                                      | the parent only, in every browser                                      | says nothing about grandparents, hence the direct-embedding rule (`window.parent === window.top`, [Q5](#unresolved-questions))                          |

The Wrapper keeps `frame-ancestors` as the primary control and adds no
`X-Frame-Options` (it cannot express a list, and where both are present
`frame-ancestors` wins). The JavaScript checks do not stop an overlay from being
drawn; they stop the overlay from leading to a start or a signature, because
nothing interactive is shown and nothing is redeemed before they pass.

**A malicious operator page.** A page on a listed origin is trusted to embed,
not trusted with secrets. What it can do:

- send `hello`, and nothing else the Wrapper reads. It cannot start a round,
  pick, cash out, cancel, or choose where the lobby or deposit goes; it cannot
  read the Wrapper's memory (another origin);
- receive `welcome` and `resize` heights: no secret, no round id, no session id,
  no amount;
- overlay or disguise the Wrapper (clickjacking by a listed embedder).
  `frame-ancestors` cannot help here, and the first release has no technical
  control for it; it is a contractual control on listed operators
  ([Q10](#unresolved-questions));
- reload or re-point the iframe. That ends the session (the key is memory only,
  OQ-1), which the operator may always do;
- reach the game frame, as an ancestor: navigate it (an ancestor may navigate a
  descendant frame) or post to it directly. Neither reaches a secret or a
  signature. A message the operator page posts to the game arrives with the
  operator's origin, so a game that checks its messages (source the Wrapper,
  origin the SE origin; the game developer's side, which the integration note
  for games should state) drops it. A game that does not check could be shown a
  forged Snapshot, but its picks still go to the Wrapper, which re-checks each
  one against its own validated Snapshot (W-23) and signs nothing else. And the
  Wrapper accepts game messages only from the game frame's `contentWindow` and
  from D (W-38), so a game frame the operator navigated elsewhere, now on
  another origin, can send the Wrapper nothing it accepts. The worst outcome is
  a wrong or broken game view, which the operator could cause anyway by covering
  or removing the iframe.

The links themselves come from the operator through the backend, in a Snapshot
the Wrapper validated; the lobby origin rule ([Q12](#unresolved-questions))
keeps a wrong or tampered lobby value from replacing the operator's page with
another site.

**Message spoofing from the game iframe.**

- Toward the Wrapper: the game's messages have `event.source` = the game frame
  and `event.origin` = D. They are routed to the controller bridge only; an
  `se.operator/1` message from the game is dropped by dispatch, and D is never
  on `operatorOrigins` (the disjoint rule).
- Toward the operator page: the game can reach `window.top` (and so the operator
  page) and post to it directly, pretending to be the Wrapper. The operator
  page's source and origin checks (the SE origin, never D) refuse it. The game's
  sandbox has no `allow-top-navigation`, so it cannot navigate the operator page
  either.
- No game message produces a navigation or an operator message: the lobby and
  deposit need the player's click on the Wrapper's own control, and the game
  never receives `context.links` (the controller allow-list leaves it out).

**The existing `se.controller/1` bridge and its allow-list.** Nothing changes in
it. The two channels share the listener only for dispatch; they share no state
and no schema. No operator message is forwarded to the game, no game message is
forwarded to the operator, and the Snapshot allow-list of the controller
boundary still decides everything the game sees.

**The Wrapper's iframe attributes, set by the operator.** Operator guidance: no
`sandbox` attribute on the Wrapper's iframe (an opaque origin would break the
session, Web Locks, and the origin checks; a sandbox without
`allow-top-navigation-by-user-activation` would also block the lobby); no
`referrerpolicy` of `no-referrer` or `same-origin` on it (it masks the
`ancestorOrigins` entry, see the masking note under
[The handshake](#the-handshake)); and no `allow` feature the
`Permissions-Policy` of the release bundle turns off.

## Test plan: what T-9a must prove

T-9a stays unit and e2e. Every case is hermetic: an injected clock for the
timeout, the in-repo fake Play API, and a fake operator page served from a third
test origin (and an unlisted fourth).

**Browsers: future work.** Today `e2e/playwright.config.ts` has only a
`chromium` project, and its no-network backstop (`BLOCK_HOST_RESOLUTION`, a
`--host-resolver-rules` launch argument) is Chromium-only. The Firefox path of
W-49 can only be proven in Firefox, so T-9a's e2e half needs `firefox` and
`webkit` projects to be added first ([Impact](#impact)). The pending entry in
`e2e/tests/pending.spec.ts` already names all three engines; until the projects
exist, the e2e cases below are run on Chromium only and the Firefox and WebKit
cases stay declared as pending, never as passing.

**Unit (the operator channel in the `shell`, the dispatch and controls in the
Wrapper app):**

1. **Source and origin.** A valid `hello` is accepted only with
   `source === window.parent` and a listed origin. Ignored: a listed origin with
   another source (a sibling frame, a popup, the game frame), an unlisted origin
   with the parent as source, `"null"`, and an origin that differs from
   `location.ancestorOrigins[0]`.
2. **Schema.** Ignored: a JSON string, an array, a non-plain object, an accessor
   property, a symbol key, a missing or extra field, `schema` other than
   `se.operator/1` (including `se.controller/1`), and a `type` the operator may
   not send (`welcome`, `resize`, or any other). An ignored message is never
   answered.
3. **First one counts.** Only the first valid `hello` opens the handshake;
   `welcome` is posted with `targetOrigin` equal to that origin, never `"*"` or
   `"/"`. A later valid `hello` from the fixed origin and `window.parent` is
   answered with `welcome` again and changes nothing else; a later `hello` from
   any other origin or source is ignored and not answered.
4. **The gate.** Before `welcome`, no redeem, no start, no signature, no game
   iframe mounted, and no control shown, on both the `ancestorOrigins` path and
   the Firefox path. After 10 s on the injected clock with no valid `hello`, the
   configuration-error state, and a later valid `hello` changes nothing.
5. **Record, then check.** A well-formed `hello` from `window.parent` that
   arrives before the configuration is validated is recorded and not answered;
   once the document is validated, a listed recorded origin completes the
   handshake without another `hello`, and an unlisted one is the
   configuration-error state. Only the first such `hello` is recorded; a message
   from any other source is not. **A slow configuration:** the configuration
   read (on the injected clock) takes longer than the operator's whole repeat
   window, the operator sends `hello` only during the read and then stops, and
   the handshake still completes and the round plays; with no `hello` at all,
   the timeout counts from the validation, not from boot.
6. **Framing.** With `ancestorOrigins` present: an unlisted entry, a `"null"`
   entry (the masked case), or more than one entry, refuses to start before any
   handshake. Nested framing (`parent !== top`) is refused on every path. A
   standalone launch needs no handshake and never posts to `window.parent`.
7. **Configuration.** `operatorOrigins` that holds the SE origin or an entry of
   `gameOrigins` is refused.
8. **`resize`.** Only after `welcome`, only to the fixed origin, an integer
   within the bound, coalesced, never repeated with the same value.
9. **Lobby and deposit.** Each control is shown only in the states the table
   allows (every state the table does not name offers neither) and only when its
   link is present in the latest validated Snapshot; the lobby only when
   `new URL(link).origin` is on `operatorOrigins`. No control for a link that
   fails `new URL`, whose protocol is not `https:` (for example a value that
   matches the schema's pattern but parses otherwise), or that carries a
   username or a password. The lobby is an anchor with `target="_top"`,
   `rel="noreferrer"`, `referrerpolicy="no-referrer"`, and the parsed URL; the
   deposit an anchor with `target="_blank"` and `rel="noopener noreferrer"`. No
   navigation follows a game message, a poll, or a timer; the game never
   receives `context.links`.
10. **No secret.** A property test over recorded sessions (the golden and
    `signature/` Snapshots): no operator message ever holds the key, the token,
    the launch code, a signature, a proof, a session id, a round id, or an
    amount.
11. **Channel separation.** A valid `se.operator/1` `hello` from the game frame
    is dropped; an `se.controller/1` message from the parent is dropped; neither
    bridge's state changes.

**E2E (the release bundle, a fake operator page):**

12. **With the `frame-ancestors` header**, an unlisted framer gets no Wrapper
    document (the browser's block).
13. **Without the header** (served on purpose, to prove the JavaScript layer
    alone): on Chromium and WebKit, an unlisted framer gets the
    configuration-error state and the fake Play API sees no redeem; on Firefox,
    an unlisted framer that sends a perfect `hello` unlocks nothing, and the
    fake Play API sees no redeem. A listed framer whose iframe has
    `referrerpolicy="no-referrer"` is refused on Chromium and WebKit if they
    mask the entry as the standard says; the test records what each engine does,
    which settles the masking assumption.
14. **A listed operator** that sends `hello`: `welcome` arrives, a round plays,
    and `resize` arrives with exactly its fields. A listed operator that sends
    nothing reaches the timeout state.
15. **The navigations, on all three browsers once the projects exist.** A click
    on the lobby control navigates the top-level window to the fake operator's
    lobby URL; a click on the deposit control opens a new page with no
    `window.opener` and no `Referer`, and the Wrapper's session stays open.
16. **The secret scan** (T-13's) also runs over every message the fake operator
    page received and every navigation URL.

## Alternatives

- **Lobby and deposit as `se.operator/1` messages** (option B of
  [Q7](#unresolved-questions)). The Wrapper would post an intent and the
  operator page would navigate itself. A schema, should review prefer it: the
  hello gains `handles` (an array, no repeats, of `"resize"`, `"lobby"`,
  `"deposit"`); `lobby` is `{ schema, type: "lobby", reason }` with `reason`
  `"player"` or `"session_ended"`; `deposit` is
  `{ schema, type: "deposit", reason }` with `reason` `"player"` or
  `"insufficient_funds"`, and, if the PO wants it, the refused bet as
  `{ value, unit }`, `value` a base-unit string copied from the Snapshot's
  `Amount.value` (never `normalized`, never computed). No URL in either; sent
  only on a click, only if handled, in the states of the table above, with the
  links as the fallback. Not proposed: the backend has no such mechanism, the
  links already carry the operator's intent, and every operator would need
  script to act on them, where links need none.
- **Both: a message when the operator handles it, the link otherwise.** The most
  flexible, but two behaviours per control and per browser to test, for no
  capability the links lack.
- **Open the lobby in a new browsing context** too. Avoids top navigation
  entirely, but leaves the operator's page, with the Wrapper still in it, behind
  a new tab of the same site: a confusing result for "back to the lobby".
- **Extend `se.controller/1` with the operator messages.** One protocol to
  maintain, but it ties two counterparties with different trust and cadence, and
  lets one channel's message parse on the other. Rejected (Versioning above).
- **The Wrapper sends first (`ready`).** On Firefox the Wrapper does not know
  the parent's origin, so it would post `ready` once per entry of
  `operatorOrigins` (only the matching one is delivered). That is one post per
  listed operator on every retry, and a post to unverified windows. Rejected for
  the operator-first `hello`.
- **Drop `hello` until the configuration is validated, and have the operator
  repeat with no cap** (option B of [Q13](#unresolved-questions)). Simpler state
  in the Wrapper (nothing is recorded), but it makes a healthy launch depend on
  the operator never stopping its repeats: an operator that caps them (the first
  draft of this RFC said 10 s) times out whenever the configuration read is slow
  (up to 15 s, W-43, and without limit while it is unreachable). Not proposed;
  the operator guidance to repeat until `welcome` stays under either option.
- **Answer only the first `hello`** (option B of [Q14](#unresolved-questions)).
  Strictly "first one counts", but an operator that missed the one `welcome`
  repeats forever. Not proposed: a second `welcome` carries nothing and goes
  only to the fixed origin.
- **A nonce echoed in the handshake.** The browser already authenticates
  `event.origin` and `event.source`; a nonce from a listed page adds nothing,
  and one from an unlisted page is refused anyway. Not proposed.
- **The handshake only where `ancestorOrigins` is missing**, as W-49 reads
  today. Fewer messages in Chromium and WebKit, but two behaviours to test, and
  an operator that forgets the handshake works everywhere except Firefox.
  [Q2](#unresolved-questions) recommends the uniform rule.
- **Redeem before the handshake** (only signing gated). Saves one message round
  trip, but redeems a launch code for a frame that may then be refused, and
  leaves the unsigned start (W-22) to a separate rule.
  [Q3](#unresolved-questions).
- **The handshake defines the capability declaration.** The operator cannot
  vouch for the client, and the backend's negotiation does not run through the
  operator page. Rejected; [Q9](#unresolved-questions).
- **`X-Frame-Options`.** Cannot list several origins. Not added.

## Tradeoffs

- The handshake costs every operator a few lines of script, even on browsers
  with `ancestorOrigins`. In exchange there is one behaviour on every browser,
  and the lobby and deposit need no operator script at all.
- Gating the redeem on the handshake adds one `postMessage` round trip to the
  launch (milliseconds when the operator answers on `load`); a missing operator
  script costs up to the 10 s timeout before the error is shown.
- Top navigation for the lobby depends on the browsers' user-activation rule for
  cross-origin frames and on the operator not sandboxing the iframe; T-9a checks
  it on all three engines once the Firefox and WebKit projects exist.
- Recording an early `hello` is one more piece of pre-configuration state in the
  Wrapper (one origin, from one source), in exchange for a handshake that a slow
  configuration read cannot break.
- Requiring the lobby's origin on `operatorOrigins` means an operator whose
  lobby lives on another origin must list it, which also lets that origin frame
  the Wrapper.
- Direct embedding only excludes aggregator pages that nest the Wrapper two
  levels deep, until [Q5](#unresolved-questions) is revisited.
- A listed but malicious operator can still disguise the Wrapper; the first
  release accepts that risk under contract.

## Impact

- **Specs (after acceptance, in the follow-up):** W-49 rewritten to the
  handshake, the gate (redeem and start included), the direct-embedding rule,
  and the timeout; a new `se.operator/1` section (likely a new file,
  `specs/wrapper/the-operator-page-and-the-operator-messages.md`) with `resize`
  and the lobby and deposit navigations; the Boundary section's "receives
  resize, lobby, and deposit messages" corrected to `resize` and the two
  navigations, and likewise the sentence of
  [`the-game-iframe-and-the-controller-boundary.md`](../../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  under `se.controller/1` that says "The operator page gets only `resize`,
  `lobby`, and `deposit` messages" (it becomes: the operator page gets only
  `welcome` and `resize`, under `se.operator/1`); the configuration rule that
  `operatorOrigins` and `gameOrigins` are disjoint and exclude the SE origin;
  the Observability section's `operator.refused` line; T-9a's row replaced by
  the [test plan](#test-plan-what-t-9a-must-prove); an Errors and edge cases row
  per refusal.
- **Markers:** closes `TODO(operator launch contract)` in
  [`specs/wrapper.md`](../../specs/wrapper.md#operator-embedding). It does not
  close `TODO(Play API)` (W-30): the RFC names it as the Snapshot's variant
  negotiation, which the backend owns and has not built
  ([Q9](#unresolved-questions)); the marker's text can be reworded to say so.
  The former `TODO(Play API, catalog)` (W-37) is closed without it: the redeem
  answer now serves D (`RedeemResponse.gameOrigin`). `TODO(Play API)` waits on
  the backend, and #42's acceptance criterion for it stays open.
- **Code (the implementer, after the spec):** an operator channel in the `shell`
  beside the controller bridge (it gates the session, so it belongs with the
  code that signs), with its closed parser; the Wrapper app's dispatch, its
  `ResizeObserver`, and its lobby and deposit anchors; the configuration
  validator's new rule. No new dependency. The `reference-game` and
  `se.controller/1` are unchanged.
- **An ADR for `se.operator/1`.** CONTRIBUTING.md's route treats a protocol as a
  hard-to-reverse choice, and operators will build against this one. On
  acceptance, the follow-up records an ADR for `se.operator/1` (numbered when it
  is written), covering the separate `se.operator/1` protocol, its
  operator-first handshake with the record-then-check rule, and lobby and
  deposit as navigations rather than messages. The RFC stays the reasoning; the
  ADR is the decision.
- **Tests:** T-9a's unit half; the e2e harness gains a fake operator page on a
  third origin (with a lobby and a deposit page), an unlisted fourth origin, and
  a way to serve the bundle with and without the `frame-ancestors` header.
- **Two new Playwright projects, `firefox` and `webkit`,** in
  `e2e/playwright.config.ts`, which today has only `chromium`. They must stay
  hermetic without the Chromium-only `BLOCK_HOST_RESOLUTION` flag:
  - every request is still served by the context routes, as for Chromium, and a
    request outside a route must reach no host. Each engine needs its own
    backstop for that; a candidate is Playwright's cross-engine `proxy` launch
    option pointed at a closed loopback port, so any unrouted request fails. The
    follow-up chooses the mechanism; it is not decided here;
  - the existing hermetic test (`e2e/tests/hermetic-workers.spec.ts`, "sockets
    outside the routes", which today also asserts the Chromium flag) is made
    engine-aware and must pass on each new project, proving its backstop, before
    any T-9a case relies on it;
  - CI's `playwright install` step installs the two engines with Playwright's
    own builds, as it does for Chromium; the builds follow the pinned
    `@playwright/test` version, so no new dependency is added.
- **Operators:** a public integration note (how to post `hello`, check sources,
  size the iframe, not sandbox it, and supply the lobby and deposit links at
  launch), in this repository, once the spec lands.

## Migration considerations

Nothing has shipped: the operator channel does not exist in code, and T-9a is a
pending (skipped) test. The only behaviour that changes for a configuration that
exists today is the disjoint-origins rule; the repository's fixtures already
keep the lists apart, and a document that breaks the rule would be a
misconfiguration. Within `se.operator/1` the message set is frozen; a later
change is `/2`.

## Unresolved questions

As proposed on 2026-10-17, kept for the reasoning. Their outcome is in
[Decisions](#decisions-2026-10-18): all are decided except Q4, Q10, and Q16.

| ID  | Question                                                                                            | Options                                                                                                                                                                                                                                   | Recommendation                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | One protocol or two?                                                                                | (A) a separate `se.operator/1`; (B) the operator messages inside `se.controller/1`                                                                                                                                                        | **A**: different trust, cadence, and audience; one channel's message never parses on the other                                                                                                                                                 |
| Q2  | Is the handshake required on every browser when framed, or only where `ancestorOrigins` is missing? | (A) every browser; (B) only Firefox, as W-49 reads today                                                                                                                                                                                  | **A**: one behaviour, one test path, and no "works except in Firefox" integrations                                                                                                                                                             |
| Q3  | What waits for the handshake?                                                                       | (A) the redeem, the start, and every signature; (B) signatures only (W-49 today); (C) signatures and the start                                                                                                                            | **A**: nothing leaves the page before the embedding is known good; the start commits the bet without a signature (W-22)                                                                                                                        |
| Q4  | Is a standalone launch (not framed) supported?                                                      | (A) yes, with no handshake, and the links navigate the Wrapper's own window; (B) no, the Wrapper must be framed                                                                                                                           | **A**: clickjacking needs a frame; mobile launches and support often open the URL directly                                                                                                                                                     |
| Q5  | Nested embedding (an aggregator page between the operator and the Wrapper)?                         | (A) direct only (`parent === top`) in the first release; (B) nested, every ancestor listed, `frame-ancestors` alone on Firefox                                                                                                            | **A**: on Firefox only the parent can be checked in code; revisit with an aggregator integration                                                                                                                                               |
| Q6  | The handshake timeout, and whether a late `hello` recovers                                          | (A) 10 s, final (reload to retry); (B) longer; (C) recover on a late `hello`                                                                                                                                                              | **A**, provisional Wrapper configuration: a recovery path is more state to test for a case that is a misconfiguration                                                                                                                          |
| Q7  | Lobby and deposit: navigations or messages?                                                         | (A) navigations to `context.links`: lobby `target="_top"`, deposit a new browsing context; (B) `se.operator/1` messages; (C) a message when handled, else the link                                                                        | **A**: the backend supplies only links and has no message mechanism; no operator script needed; nothing the operator sends picks a URL                                                                                                         |
| Q8  | May the player reach the lobby or deposit during a round?                                           | (A) not offered while `starting`, `active`, `resolving`, or an action is pending; (B) offered, with a warning                                                                                                                             | **A** for the first release: leaving ends the session and the round runs to its expiry rule (OQ-1); the operator's own UI still can                                                                                                            |
| Q9  | The capability declaration (W-30): what carries it?                                                 | (A) the Snapshot's variant negotiation, backend-owned and pending; (B) something the handshake defines                                                                                                                                    | **A**, as this RFC proposes; how and when the Wrapper takes part is the backend's to define; the kit fails closed meanwhile                                                                                                                    |
| Q10 | A listed operator that disguises the Wrapper                                                        | (A) accept, contractual control on listed operators; (B) add a visibility check later (no cross-browser API today)                                                                                                                        | **A** for the first release, recorded as a residual risk in the spec's Security section                                                                                                                                                        |
| Q11 | Bind a session to its operator's origin                                                             | (A) not now: any listed origin may frame any launch; (B) the backend tells the Wrapper the session's operator origin                                                                                                                      | **A** now; B would be a backend-owned addition, to raise with the backend as a later increment                                                                                                                                                 |
| Q12 | Which origins may the links have?                                                                   | (A) lobby on `operatorOrigins`, deposit any `https:`; (B) both on `operatorOrigins`; (C) both any `https:` (the schema's rule only)                                                                                                       | **A**: the lobby replaces the operator's page, the deposit opens apart and may be a payment provider's page                                                                                                                                    |
| Q13 | A `hello` that arrives before the configuration is validated                                        | (A) record the first well-formed one from `window.parent`, with its browser-set origin, and check it after validation; (B) drop it, and have the operator repeat with no cap                                                              | **A** (proposed in this RFC): the parent is fixed for the document's life, and a slow configuration read (up to 15 s, or unlimited retries while unreachable) cannot time out a healthy operator                                               |
| Q14 | A valid `hello` after the handshake                                                                 | (A) answer it with `welcome` again, to the fixed origin, and change nothing else; (B) ignore it                                                                                                                                           | **A** (proposed in this RFC): harmless, since `welcome` carries nothing, and it stops an operator that missed the first one                                                                                                                    |
| Q15 | The `resize` bound                                                                                  | (A) 16384 CSS pixels, provisional; (B) another bound; (C) no bound, any positive safe integer                                                                                                                                             | **A** until an operator's layout needs more; a bound keeps a broken layout from asking the operator for an absurd height                                                                                                                       |
| Q16 | The balance after a deposit in another tab                                                          | (A) at `idle` and after a round ends, read the Snapshot once when the page becomes visible again (`visibilitychange`) or regains focus, debounced; (B) a "refresh balance" control; (C) nothing: the next start's answer is authoritative | **A**: at `idle` the Wrapper does not poll (W-35), so without it the next start may get `INSUFFICIENT_FUNDS` against a balance already topped up; `visibilitychange` covers a returning tab, `focus` a separate window; one read, never a poll |
