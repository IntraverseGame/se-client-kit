# Operator embedding

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

The operator page (origin A) embeds the Wrapper (the SE origin) in an iframe,
and the Wrapper hosts the game (origin D) in a second iframe. This file is the
operator side: how the Wrapper checks who frames it, the `se.operator/1`
handshake, `resize`, and the lobby and deposit controls. The decisions behind it
were taken in human review on 2026-10-18 (RFC-001,
[`rfcs/active/RFC-001-operator-launch-contract.md`](../../rfcs/active/RFC-001-operator-launch-contract.md),
section Decisions) and are recorded in
[ADR-006](../../decisions/ADR-006-the-operator-protocol-se-operator-1.md). The
launch URL, the launch code's form, and the operator's side of the backend's
launch are the backend's launch URL contract and are only named here (W-1).

**What is built.** The requirements below are built (#42). They replaced the
fail-closed minimum of 2026-10-17 (#58, summarized at the end of this file) and
tightened it in two ways: a framed page whose `location.ancestorOrigins` lists
more than one origin is refused under W-49a (direct embedding only), and a
framed page on a browser with `location.ancestorOrigins` waits for the handshake
of W-49c before it opens a session. Where the code is: the shell's operator
channel (`operator-channel.ts`, `operator-protocol.ts`) holds the handshake and
`resize`; the Wrapper app holds the framing decision (`embedding.ts`), the one
`message` listener (`message-dispatch.ts`), the gate that awaits the handshake
before the session opens (`operator-gate.ts`), the height observer
(`height-observer.ts`), and the lobby and deposit anchors (`operator-links.ts`).
ADR-006 is still proposed: its acceptance is the human's call before the merge.

## The rule

- **W-49.** `frame-ancestors`, a response header set by the host
  ([client-kit.md](../client-kit.md#how-the-wrapper-reaches-the-superengine-origin)),
  is the primary control; the requirements of this file are defense in depth.
  The Wrapper MUST accept a message from the operator page only if
  `event.source === window.parent` **and** `event.origin` is in
  `operatorOrigins` (exact match), MUST post to it only with `targetOrigin` set
  to that one origin (never `"*"` and never `"/"`), and MUST parse every message
  against the closed `se.operator/1` schema (W-49b). Together with W-49a and
  W-49c, this keeps another page from framing the Wrapper and leading the player
  to start a round or cash out (clickjacking).

## Framing

- **W-49a.** Once the environment configuration document is validated, the
  Wrapper MUST decide its framing before it opens a session:
  - **Not framed** (`window.parent === window`): a standalone launch. There is
    no handshake and no operator channel, and the Wrapper continues as today.
    Whether a standalone launch stays supported is RFC-001's open question Q4;
    today it is.
  - **Framed and nested** (`window.parent !== window.top`): the
    configuration-error state; nothing is redeemed or signed. Only direct
    embedding is supported: where `location.ancestorOrigins` is missing, only
    the parent can be checked in code.
  - **Framed, and `location.ancestorOrigins` exists:** unless it holds exactly
    one entry and that entry is on `operatorOrigins` (exact match), the
    configuration-error state; nothing is redeemed or signed. A masked entry
    (`"null"`) refuses, and so does an empty list. A listed entry still needs
    the handshake (W-49c).
  - **Framed, and `location.ancestorOrigins` is missing** (no browser the suite
    runs; Firefox has it too, as its first run there showed, 2026-10-18): the
    handshake (W-49c).

  **`ancestorOrigins` masking.** The HTML standard masks an ancestor's origin
  when the embedding iframe's referrer policy is `no-referrer`, or `same-origin`
  for a cross-origin parent: the entry reads `"null"`. An operator page that
  sets either value on the Wrapper's iframe is refused on that path (the
  operator guidance below). T-9a's e2e case records what each engine does
  (2026-10-19, Playwright 1.64.0): its Firefox build masks the entry and
  refuses; its WebKit build, and an installed Google Chrome 155 run as the
  Chromium project through the opt-in `SE_E2E_BROWSER_CHANNEL=chrome`, keep the
  operator's origin, so the handshake decides there. Playwright's own Chromium
  build was not observed locally; CI's Chromium job records it. An operator page
  must not rely on either.

## The `se.operator/1` protocol

- **W-49b.** The operator channel is a protocol of its own, `se.operator/1`,
  separate from the game's `se.controller/1` (ADR-006). Every message is a JSON
  object with `schema: "se.operator/1"` and a `type`:

  | Direction           | `type`    | Fields                     | Meaning                                                         |
  | ------------------- | --------- | -------------------------- | --------------------------------------------------------------- |
  | operator to Wrapper | `hello`   | `schema`, `type`           | the handshake: "I am the page that embeds you"                  |
  | Wrapper to operator | `welcome` | `schema`, `type`           | the handshake is accepted; the operator stops repeating `hello` |
  | Wrapper to operator | `resize`  | `schema`, `type`, `height` | the height the Wrapper's content needs (W-49d)                  |

  The operator page sends one kind of message, `hello`. Nothing it sends can
  start a round, sign, choose a URL, or change what the Wrapper shows beyond
  unlocking it. Within `/1` the message set and every message's fields are
  frozen: a change is `se.operator/2`, and a Wrapper MAY accept both versions
  during a transition.

  The message rules, as for `se.controller/1`
  ([the message rules](./the-game-iframe-and-the-controller-boundary.md)):
  - A message is a plain object with exactly its fields. A string (a JSON text
    included), an array, a non-plain object, an accessor property, a symbol key,
    a missing field, or an extra field fails the schema and is ignored.
  - A message whose `schema` is not `se.operator/1`, or whose `type` is not one
    this direction allows, is ignored. The Wrapper never answers a message it
    ignores, so a sender learns nothing from a refusal.
  - **Dispatch by source first.** The Wrapper has one `message` listener. It
    routes by `event.source` before it parses: `window.parent` to the operator
    channel, the game frame's `contentWindow` to the controller bridge (W-38),
    anything else dropped. Each channel then checks `event.origin` (A on
    `operatorOrigins`, or D) and its own schema. When the Wrapper is not framed,
    `window.parent === window`, so there is no operator route: a message whose
    source is the Wrapper's own window is dropped. The two channels share no
    state and no schema; no operator message is forwarded to the game and no
    game message to the operator.
  - **No secret in any message, in either direction:** no action key, play
    token, launch code, signature, proof, `CreateRoundAuth`, header, session id,
    round id, or amount. No `se.operator/1` message carries money; a later
    version that adds one carries a base-unit string, never a JS `number`
    (W-34).

  The operator channel is the shell's, beside the controller bridge, because it
  gates the session; the Wrapper app holds the dispatch, the `ResizeObserver`,
  and the lobby and deposit anchors.

## The handshake

- **W-49c.** A framed Wrapper (W-49a) MUST complete this handshake before the
  gate opens. The operator page sends first: the Wrapper never posts to a window
  whose origin it has not verified, and where `location.ancestorOrigins` is
  missing it cannot learn the parent's origin until the parent writes to it.
  1. **Record, then check.** The Wrapper installs its `message` listener at
     boot, before it reads the environment configuration document. Until the
     document is validated it cannot check an origin, so it records the first
     well-formed `hello` whose `event.source === window.parent`, with its
     `event.origin` (set by the browser), and answers nothing. It keeps no other
     message. This is safe because the parent is fixed for the life of the
     Wrapper's document: a parent that navigates discards the Wrapper's document
     with it. It is needed because the configuration read can take up to 15 s
     (W-43) and is retried while the document is unreachable
     ([Configuration](../wrapper.md#configuration)), so dropping an early
     `hello` would let a healthy operator time out.
  2. **After validation**, the Wrapper decides its framing (W-49a). If a `hello`
     was recorded, it is checked at once as in step 3: an origin that passes
     step 3's check completes the handshake, and any other (unlisted, or not
     equal to `location.ancestorOrigins[0]` where that exists) is the
     configuration-error state with the reason `operator-not-allowed` (decided
     2026-10-19; the parent's origin cannot change, so waiting would not help).
     Otherwise the handshake timer starts.
  3. **Accept the first valid `hello`** (the recorded one, or the first after
     validation) with `event.source === window.parent`, an `event.origin` on
     `operatorOrigins` (exact match, and equal to `location.ancestorOrigins[0]`
     where that exists), and a valid schema. From then on, for the life of the
     Wrapper's document, the **operator origin** is fixed to that
     `event.origin`: every later post uses it as `targetOrigin`, and every later
     message must come from it and from `window.parent`. The Wrapper posts
     `welcome`.
  4. **A later valid `hello`** from the fixed origin and `window.parent` does
     not reopen the handshake (the first counts), but the Wrapper answers it
     with `welcome` again, to the fixed origin, so an operator that missed the
     first one stops repeating. A `hello` from any other origin or source is
     ignored and not answered.

  **The gate.** Until the handshake is accepted, the Wrapper redeems nothing,
  starts no round, signs nothing, mounts no game iframe, and offers no control
  (the lobby and deposit included); it shows the loading state. The start call
  carries no signature (W-22) but commits the bet, so it waits too. The launch
  code is still read and stripped from the URL first (W-1) and waits in the
  shell's closure, not in the URL.

  **The timeout.** The timer starts only once the configuration document is
  validated and no `hello` was recorded. If no valid `hello` is accepted within
  **10 s** of its start (SHOULD: 10 s, Wrapper configuration, provisional), the
  Wrapper shows the configuration-error state. That is final for the page: a
  late `hello` is ignored, nothing is redeemed, and the operator reloads the
  iframe to retry. The launch code is never sent and expires on the backend's
  schedule.

  **The launch code's lifetime.** The backend's TPO stated on 2026-10-18 that a
  launch code lives 60 s from the operator's Launch call (not from the page's
  load). The kit's worst case before the redeem, with a reachable configuration
  document, is about 25 s (the 15 s configuration timeout, W-43, plus the 10 s
  handshake timer), which leaves a margin of about 35 s. No contract change.
  Both are the Wrapper's default, configurable timeouts (the 10 s is
  provisional), and the 60 s holds only while they stay at or below those
  defaults: if they are raised, the launch code's lifetime must be raised too
  (b6e1e48). So the backend MUST be told first whenever either is raised,
  whether by a change of the Wrapper's default or by an environment's
  configuration (the backend's TPO, 2026-10-18). A configuration document that
  stays unreachable can still outlast the code; the redeem is then refused and
  the Wrapper shows the session-ended state with the relaunch instruction (W-2).

  **A missing or invalid handshake.** Every message that fails a check (source,
  origin, schema) is ignored and the timer keeps running; nothing is ever posted
  to a sender that failed the checks.

## `resize`

- **W-49d.** After `welcome`, the Wrapper SHOULD tell the operator page the
  height its content needs:

  | Field    | Value                                                                                                                                                                |
  | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `schema` | `"se.operator/1"`                                                                                                                                                    |
  | `type`   | `"resize"`                                                                                                                                                           |
  | `height` | the document's `scrollHeight` in CSS pixels, an integer from 1 to 16384; a larger value is sent as 16384 (the bound is provisional, decided 2026-10-18, RFC-001 Q15) |
  - Sent only after `welcome`, only to the fixed operator origin, with no reply;
    the operator page MAY ignore it.
  - Sent once right after `welcome`, then whenever the height changes (observed
    with `ResizeObserver`), at most once per animation frame, and never with the
    same value twice in a row. It may be sent in every state after `welcome`,
    error states included, and in no state before it.
  - No width: the operator page lays out the width, and the Wrapper's layout
    follows it (W-47's 200 % zoom rule).
  - It is the only message the Wrapper sends on its own. No game message and no
    Snapshot field changes it except through the Wrapper's own layout.

## Lobby and deposit

- **W-49e.** The lobby and the deposit are **navigations, not messages**
  (ADR-006). The backend supplies them only as the operator's URLs in the
  Snapshot, `context.links.lobby` and `context.links.deposit` (each an `https:`
  URL that `se.snapshot/1` validates), and has no message mechanism for them.
  The Wrapper MUST use those links and never a URL from a message, a URL
  parameter, or the game:

  | Control | When framed (after `welcome`)                                                                                                                           | When standalone                                    |
  | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
  | Lobby   | `<a href="{lobby}" target="_top" rel="noreferrer" referrerpolicy="no-referrer">`: the player's click navigates the top-level window (the operator page) | the same link, navigating the Wrapper's own window |
  | Deposit | `<a href="{deposit}" target="_blank" rel="noopener noreferrer">`: a new browsing context; the session stays open                                        | the same                                           |
  - **Only the player's click.** The navigation is an anchor the player
    activates, never script on a timer, a poll, a Snapshot, an error by itself,
    or a game message, so the game cannot make the operator page navigate. A
    click is the user activation browsers require before a cross-origin frame
    may navigate the top-level window.
  - **The URL rule.** The schema's `HttpsUrl` is only a pattern, so the Wrapper
    parses each link with `new URL(link)` before it shows a control. A link that
    fails to parse, whose `protocol` is not `https:`, or that carries a
    non-empty `username` or `password` shows no control. The anchor's `href` is
    the parsed URL's `href`.
  - **The link's origin** (decided 2026-10-18, RFC-001 Q12). The lobby replaces
    the operator's page, so its `new URL(link).origin` MUST be on
    `operatorOrigins` (exact match); otherwise no lobby control is shown. An
    operator whose lobby lives on another origin lists it, which also lets that
    origin frame the Wrapper. The deposit opens apart from the operator's page
    and may be a payment provider's, so it needs only the URL rule.
  - **Present or not.** A control is shown only when its link is present in the
    latest validated Snapshot and passes the rules above. With no link there is
    no control; the Wrapper never builds or guesses a URL.
  - **No referrer, no opener.** The deposit anchor gives the new page no
    `window.opener` and no referrer, as the verify link does (W-39). The lobby
    anchor sends no referrer even where the release bundle's
    `Referrer-Policy: no-referrer` header is missing; its navigation discards
    the Wrapper's document, so there is no opener to keep.
  - **The CSP needs no change.** The release policy limits fetches, frames,
    forms, and `base-uri` and has no navigation directive; the links are not
    fetched, framed, or posted to.
  - **Leaving ends the session.** A lobby navigation discards the key and the
    token with the page (OQ-1), hence W-49f.

- **W-49f.** Which Wrapper states offer the controls (decided 2026-10-18,
  RFC-001 Q8). The state names are those of W-44 and the status table of W-31.

  | Wrapper state                                                                                                                                                   | Lobby                                   | Deposit |
  | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------- |
  | before `welcome` (framed), loading, the configuration-error state                                                                                               | no                                      | no      |
  | a start or cash-out call in flight, in any state (decided 2026-10-19)                                                                                           | no                                      | no      |
  | `idle`, and a typed error or the generic error shown at `idle`, `INSUFFICIENT_FUNDS` included (W-42)                                                            | yes                                     | yes     |
  | `starting`, `active`, `resolving`, or any state with a signed action not yet seen applied (W-15)                                                                | no                                      | no      |
  | `won`, `lost`, `canceled` (the round id and verify link shown, W-39), and a typed error shown beside them (`INSUFFICIENT_FUNDS` on the next start, for example) | yes                                     | yes     |
  | session ended (the relaunch instruction of W-1a and W-2)                                                                                                        | yes, labelled as the way to relaunch    | no      |
  | open in another tab, round failed verification, out of sync, Snapshot rejected (W-44)                                                                           | yes, from the latest validated Snapshot | no      |
  | connection problem (W-43), "game not compatible" (W-38), the generic error (W-42) outside `idle`                                                                | no                                      | no      |
  | "this browser cannot keep your session safe" (W-14), "could not verify the chain" (W-26a), and any other state, including one a later spec adds                 | no                                      | no      |

  **The generic error** is the shell's `refused` answer (it did not act on the
  player's request, or the use case failed), shown as "Something went wrong"; a
  typed error is a Play API problem with its `code`. **The "chain check not
  independent" indicator** (W-26a) is a development notice shown for the whole
  session, not a state: it hides no control, and the controls follow the other
  rows (decided 2026-10-19). **A call in flight**: from the player's start or
  cash-out until its answer is shown, neither control is offered, since leaving
  would end the session before the answer (decided 2026-10-19); "check again", a
  read only, hides nothing.

  During a round the controls are hidden because leaving ends the session and
  the round then runs to its expiry rule (OQ-1); the operator's own page may
  still offer its lobby. In the session-ended state the lobby is the "ask the
  operator's page for a new launch" step the Play API document describes for
  `SESSION_EXPIRED` and `SESSION_REVOKED`. A state reached before any Snapshot
  was validated (a refused redeem, for example) has no `context.links` and so no
  control: it shows the relaunch instruction as text.

  Not decided: whether the Wrapper reads the balance again when the player comes
  back from a deposit in another tab (RFC-001 Q16, a follow-up).
  <!-- TODO(RFC-001 Q16): the balance after a deposit in another tab; W-35 does not poll at `idle`, so the next start's answer is authoritative until this is decided. -->

## What is logged

Through the shell's redacting logger, at `warn`, once per page: one event,
`embedding.refused`, with a reason code only, never an origin or a message's
content. The reasons:

| Reason                 | When                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ancestor-not-allowed` | `location.ancestorOrigins` names an origin that is not on `operatorOrigins`                                                                                                  |
| `ancestor-masked`      | an entry of `location.ancestorOrigins` is `"null"`                                                                                                                           |
| `ancestors-unknown`    | framed, with an empty `location.ancestorOrigins`; or the framing is unknown (none was read from the platform, or a page held framed has no operator channel)                 |
| `nested`               | framed, with `window.parent !== window.top` or more than one `location.ancestorOrigins` entry                                                                                |
| `operator-not-allowed` | a recorded `hello` (W-49c, step 1) came from an origin that is not on `operatorOrigins`, or is not `location.ancestorOrigins[0]` where that list exists (decided 2026-10-19) |
| `handshake-timeout`    | no valid `hello` within the handshake timeout                                                                                                                                |

Nothing is logged for an ignored message, so a hostile page cannot flood the
console. This follows the [Observability](../wrapper.md#observability) section:
console only, no backend telemetry. A framed page without
`location.ancestorOrigins` logs nothing for its framing: it waits for the
handshake (W-49c).

## Security

- **Origin and source, both.** An origin alone would accept a sibling iframe, a
  popup, or another tab of a listed operator origin; a source alone would accept
  a parent that is not listed.
- **Disjoint origins.** `operatorOrigins` and `gameOrigins` share no entry, and
  neither holds the SE origin ([Configuration](../wrapper.md#configuration)), so
  no origin is both an embedder and a game.
- **Clickjacking.** `frame-ancestors` covers every ancestor, before the
  Wrapper's code runs, but only as a header (ignored in a `<meta>` policy) and
  with one list per environment. The `location.ancestorOrigins` check covers
  every ancestor in Chromium and WebKit, at boot. The handshake covers the
  parent in every browser, hence the direct-embedding rule. The Wrapper adds no
  `X-Frame-Options` (it cannot express a list). The JavaScript checks do not
  stop an overlay from being drawn; they stop it from leading to a start or a
  signature, because nothing interactive is shown and nothing is redeemed before
  they pass.
- **A listed operator page** is trusted to embed, not with secrets. It can send
  `hello` and nothing else the Wrapper reads; it receives `welcome` and heights;
  it can reload or re-point the iframe, which ends the session (OQ-1); and, as
  an ancestor, it can navigate or post to the game frame, which reaches no
  secret and no signature: the Wrapper accepts game messages only from the game
  frame and D (W-38) and re-checks every pick against its own validated Snapshot
  (W-23).
- **Residual risk: a listed operator that disguises the Wrapper** (overlays or
  restyles it). `frame-ancestors` cannot help, and no cross-browser API detects
  it today; the first release has no technical control, only the operator's
  contractual obligations. Recorded as a residual risk; whether a technical
  control is added later is RFC-001's open question Q10.
- **Any listed origin may frame any launch.** The Wrapper does not bind a
  session to the operator origin that launched it. Decided "not now" on
  2026-10-18 (RFC-001 Q11, confirmed by the backend's TPO, and recorded in the
  backend's documentation at b6e1e48): there is no operator-origin binding in
  the first release; a later contract change may serve the session's operator
  origin on `sessions:redeem`. The single-use launch code, which only the
  launching operator receives, is the guard.
- **Spoofing from the game.** A game message has the game frame as its source
  and D as its origin: dispatch routes it to the controller bridge only, and D
  is never on `operatorOrigins`. The game can post to the operator page
  pretending to be the Wrapper; the operator page's own checks (below) refuse
  it. The game's sandbox has no `allow-top-navigation`, and the game never
  receives `context.links`.

## Operator guidance

The public integration note for an operator page that embeds the Wrapper. It
uses only what the page observes: the launch URL it was given (the SE origin is
that URL's origin), the iframe it creates, and the messages it receives.

**Embed.** Put the launch URL in an iframe on your own page, directly: the
Wrapper refuses to start when another page sits between yours and it (W-49a),
and when your page's origin is not on the environment's `operatorOrigins` list
(ask SuperEngine to list every origin that embeds the Wrapper, and the origin of
your lobby). On that iframe set no `sandbox` attribute, no `referrerpolicy` of
`no-referrer` or `same-origin` (some browsers then hide your origin from the
Wrapper, which refuses), and no `allow` feature the Wrapper's
`Permissions-Policy` turns off.

**Say hello.** On the iframe's `load` event, post
`{ "schema": "se.operator/1", "type": "hello" }` to the iframe's `contentWindow`
with `targetOrigin` set to the SE origin, never `"*"`, and repeat it every 250
ms until `welcome` arrives (SHOULD). Keep no timer of your own: the Wrapper
waits up to 10 s after it has read its configuration, then shows "The game
cannot start", and only reloading the iframe (with a new launch) retries. Until
`welcome`, the Wrapper redeems nothing and shows only its loading state.

```js
const frame = document.querySelector("#se-wrapper"); // your iframe
const seOrigin = new URL(launchUrl).origin;
let welcomed = false;
const hello = () =>
  frame.contentWindow?.postMessage(
    { schema: "se.operator/1", type: "hello" },
    seOrigin,
  );
window.addEventListener("message", event => {
  if (event.source !== frame.contentWindow || event.origin !== seOrigin) return;
  if (event.data?.type === "welcome") welcomed = true;
  if (event.data?.type === "resize" && Number.isInteger(event.data.height)) {
    frame.style.height = `${event.data.height}px`;
  }
});
frame.addEventListener("load", () => {
  hello();
  const timer = setInterval(
    () => (welcomed ? clearInterval(timer) : hello()),
    250,
  );
});
frame.src = launchUrl;
```

**Check what you receive.** Act on a message only when `event.source` is the
iframe's `contentWindow` and `event.origin` is the SE origin. The Wrapper sends
`welcome` and `resize` only; a game inside it can post to your page too, from
another origin, and must be ignored.

**Size the iframe (optional).** `resize` carries `height`, the CSS pixels the
Wrapper's content needs, an integer from 1 to 16384. The width is yours.

**Lobby and deposit.** Supply both links when you launch the session; the
Wrapper shows them to the player as its own links, never as messages. The
lobby's origin must be on `operatorOrigins`: the player's click navigates your
top-level page there, and ends the Wrapper's session. The deposit, any `https:`
URL, opens in a new tab with no opener and no referrer, and the session stays
open. The Wrapper hides both while a round is in play.

## The test plan for T-9a

T-9a is unit and e2e. Every case is hermetic: an injected clock for the timeout,
the in-repo fake Play API, and a fake operator page on a third test origin (and
an unlisted fourth). Its e2e cases run in the Chromium, Firefox, and WebKit
projects ([testing-and-ci.md](../client-kit/testing-and-ci.md)):
`t9a-embedding.spec.ts`, `t9a-navigations.spec.ts`, and
`t9a-operator-round.spec.ts`. The unit cases are the shell's
`operator-channel.test.ts`, `operator-protocol.test.ts` (1 to 3, 5, 8, 10), and
the Wrapper's `operator-gate.test.ts`, `operator-gate-guards.test.ts`,
`operator-gate-closed.test.ts`, `embedding.test.ts`,
`environment-config.test.ts`, `operator-links.test.ts`,
`operator-links-calls.test.ts`, `operator-no-secret.test.ts`, and
`message-dispatch.test.ts` (4 to 12).

**Unit** (the operator channel in the `shell`; the dispatch and the controls in
the Wrapper app):

1. **Source and origin.** A valid `hello` is accepted only with
   `source === window.parent` and a listed origin. Ignored: a listed origin with
   another source (a sibling frame, a popup, the game frame), an unlisted origin
   from the parent, `"null"`, and an origin that differs from
   `location.ancestorOrigins[0]`.
2. **Schema.** Ignored, and never answered: a JSON string, an array, a non-plain
   object, an accessor property, a symbol key, a missing or extra field, a
   `schema` other than `se.operator/1` (including `se.controller/1`), and a
   `type` the operator may not send.
3. **First one counts.** Only the first valid `hello` opens the handshake;
   `welcome` goes to that origin, never `"*"` or `"/"`. A later valid `hello`
   from the fixed origin and the parent is answered with `welcome` again and
   changes nothing else; one from any other origin or source is ignored.
4. **The gate.** Before `welcome`: no redeem, no start, no signature, no game
   iframe, and no control, on the `ancestorOrigins` path and the path without it
   (a component test: every project's browser has the list). After 10 s on the
   injected clock with no valid `hello`, the configuration-error state, and a
   later valid `hello` changes nothing.
5. **Record, then check.** A well-formed `hello` from the parent before the
   configuration is validated is recorded and not answered; once validated, a
   listed recorded origin completes the handshake without another `hello`, and
   an unlisted one is the configuration-error state. Only the first is recorded,
   and nothing from another source. With a configuration read longer than the
   operator's whole repeat window, the handshake still completes and the round
   plays; with no `hello` at all, the timeout counts from the validation, not
   from boot.
6. **Framing.** With `ancestorOrigins`: an unlisted entry, a `"null"` entry, an
   empty list, or more than one entry refuses before any handshake. Nested
   framing (`parent !== top`) is refused on every path. A standalone launch
   needs no handshake and never posts to `window.parent`.
7. **Configuration.** An `operatorOrigins` that holds the SE origin or an entry
   of `gameOrigins`, or a `gameOrigins` that holds the SE origin, is refused.
8. **`resize`.** Only after `welcome`, only to the fixed origin, an integer
   within the bound, coalesced, never the same value twice in a row.
9. **Lobby and deposit.** Each control only in the states W-49f allows and only
   when its link is present in the latest validated Snapshot; the lobby only on
   a listed origin. No control for a link that fails `new URL`, is not `https:`,
   or carries a username or a password. The anchors carry exactly the attributes
   of W-49e. No navigation follows a game message, a poll, or a timer; the game
   never receives `context.links`.
10. **No secret.** A property test over recorded sessions (the golden and
    `signature/` Snapshots): no operator message holds the key, the token, the
    launch code, a signature, a proof, a session id, a round id, or an amount.
11. **Channel separation.** A valid `se.operator/1` `hello` from the game frame
    is dropped, an `se.controller/1` message from the parent is dropped, and
    neither channel's state changes.
12. **Logging.** Each refusal logs `embedding.refused` once with its reason
    only; an ignored message logs nothing.

**E2E** (the release bundle and a fake operator page):

13. **With the `frame-ancestors` header**, an unlisted framer gets no Wrapper
    document.
14. **Without the header** (served so on purpose, to prove the JavaScript layer
    alone): in every project (each browser has `location.ancestorOrigins`,
    Firefox's included) an unlisted framer gets the configuration-error state
    and the fake Play API sees no redeem; where the list is missing, an unlisted
    framer that sends a perfect `hello` unlocks nothing and nothing is redeemed
    (a component test, since no project lacks the list). A listed framer whose
    iframe has `referrerpolicy="no-referrer"` is refused where the engine masks
    the entry; the test records what each engine does.
15. **A listed operator** that sends `hello`: `welcome` arrives, a round plays,
    and `resize` arrives with exactly its fields. One that sends nothing reaches
    the timeout state. A page that nests the Wrapper is refused.
16. **The navigations**, on each engine the suite runs: the lobby control
    navigates the top-level window to the fake operator's lobby URL; the deposit
    control opens a new page with no `window.opener` and no `Referer`, and the
    Wrapper's session stays open.
17. **The secret scan** (T-13's) also runs over every message the fake operator
    page received and every navigation URL.

The e2e harness has the fake operator page (`e2e/tests/operator`,
`harness/operator-page.ts`) on a third origin (with a lobby and a deposit page)
and on an unlisted fourth, a Snapshot answer that carries the operator's
`context.links`, and a way to serve the bundle with the `frame-ancestors` header
(without it is the suite's default).

## The minimum it replaced

From 2026-10-17 (#58) until #42, the Wrapper applied a fail-closed minimum: a
framed page opened a session only where `location.ancestorOrigins` existed and
every entry was on `operatorOrigins`, and refused everywhere else; it sent and
accepted no operator message. W-49a to W-49f replaced it.
